'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { parse, unparse } from 'papaparse';
import { Edit2, Save, X, Settings } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// Interfaces principales
interface ColumnVisibility {
  index: number;
  visible: boolean;
  name: string;
}

interface CSVResult {
  data: string[][];
  errors: any[];
  meta: any;
}

interface DraggedTaskData {
  task: string[];
  date: string;
  operationId: string;
  startDate: string | null;
  endDate: string | null;
  originalTechnician: string;
  startPercentage: number;
  duration: number;
}

interface TaskData {
  task: string[];
  startPercentage: number;
  duration: number;
  operationId: string;
  isMultiDay: boolean;
  isStart: boolean;
  isEnd: boolean;
  isUnassigned?: boolean;
}

interface GanttChartData {
  group: string;
  tasks: TaskData[];
  overlaps: Map<string, number>;
  rowHeight: number;
  isUnassignedGroup?: boolean;
}

interface GroupData {
  groups: string[];
  groupIndex: number;
  labelIndex: number;
  unassignedTasks: string[][];
}

interface EditingActions {
  row: string[];
  cell: string;
  header: string;
  index: number;
}

interface RenderProps {
  HEADER_HEIGHT: number;
  task: string[];
  groupBy: string;
  labelIndex: number;
}

interface TaskTiming {
  startPercentage: number;
  duration: number;
}

// Début du composant principal
const CSVViewer: React.FC = () => {
  // États du composant
  const [data, setData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [isFiltering, setIsFiltering] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [uniqueDates, setUniqueDates] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [allTechnicians, setAllTechnicians] = useState<string[]>([]);
  const [newTechnician, setNewTechnician] = useState<string>('');
  const [draggedTask, setDraggedTask] = useState<DraggedTaskData | null>(null);
  const [dropZoneActive, setDropZoneActive] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<Record<string, string>>({});
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility[]>([]);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  // Fonctions utilitaires de base pour la gestion du temps
  const getTimePercentage = (time: string, isStartOfDay: boolean = false, isEndOfDay: boolean = false): number => {
    if (isStartOfDay) return 0;     // Début de journée (00:00)
    if (isEndOfDay) return 100;     // Fin de journée (23:59)
    if (!time) return 33.33;        // 8:00 par défaut
    
    try {
      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) return 33.33;
      return ((hours * 60 + minutes) / (24 * 60)) * 100;
    } catch (err) {
      console.error('Erreur lors du calcul du pourcentage de temps:', err);
      return 33.33;
    }
  };
  // Fonction de calcul des durées pour les tâches multi-jours
  const calculateTaskTiming = (task: string[], currentDate: string): TaskTiming => {
    const startDate = task[2];
    const endDate = task[4];
    const startTime = task[3];
    const endTime = task[5];

    // Si pas de dates, retourne les valeurs par défaut
    if (!startDate || !endDate) {
      return {
        startPercentage: getTimePercentage(startTime),
        duration: 4.17 // 1 heure par défaut
      };
    }

    const isFirstDay = isSameDay(startDate, currentDate);
    const isLastDay = isSameDay(endDate, currentDate);
    const isMiddleDay = !isFirstDay && !isLastDay;

    // Jour intermédiaire : tâche sur toute la journée
    if (isMiddleDay) {
      return {
        startPercentage: 0,
        duration: 100
      };
    }

    // Premier jour : de l'heure de début jusqu'à la fin de la journée
    if (isFirstDay && !isLastDay) {
      return {
        startPercentage: getTimePercentage(startTime),
        duration: 100 - getTimePercentage(startTime)
      };
    }

    // Dernier jour : du début de la journée jusqu'à l'heure de fin
    if (isLastDay && !isFirstDay) {
      return {
        startPercentage: 0,
        duration: getTimePercentage(endTime)
      };
    }

    // Même jour (début et fin le même jour)
    return {
      startPercentage: getTimePercentage(startTime),
      duration: getTimePercentage(endTime) - getTimePercentage(startTime)
    };
  };

  // useEffect pour la gestion des touches clavier et la visibilité des colonnes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        setIsFiltering(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (headers.length > 0 && columnVisibility.length === 0) {
      const initialVisibility = headers.map((header, index) => ({
        index,
        visible: [0,1,2,3,4,5,10,11,15,16].includes(index),
        name: header
      }));
      setColumnVisibility(initialVisibility);
    }
  }, [headers]);

  // Fonctions utilitaires de base
  const isSameDay = (date1: string, date2: string): boolean => {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const getOperationId = (task: string[]): string => {
    return `${task[0]}_${task[1]}_${task[2] || 'unassigned'}_${task[4] || 'unassigned'}`;
  };

  const getUniqueColor = (index: number): string => {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const detectOverlaps = (tasks: TaskData[]): Map<string, number> => {
    const sortedTasks = [...tasks].sort((a, b) => {
      if (a.startPercentage === b.startPercentage) {
        return (b.startPercentage + b.duration) - (a.startPercentage + a.duration);
      }
      return a.startPercentage - b.startPercentage;
    });

    const overlaps = new Map<string, number>();
    const timeSlots = new Map<string, string>();

    for (let i = 0; i < sortedTasks.length; i++) {
      const currentTask = sortedTasks[i];
      const currentId = getOperationId(currentTask.task);
      const start = currentTask.startPercentage;
      const end = start + currentTask.duration;

      let level = 0;
      let foundSlot = false;

      while (!foundSlot) {
        foundSlot = true;
        for (let time = Math.floor(start); time <= Math.ceil(end); time += 1) {
          const timeKey = `${level}_${time}`;
          if (timeSlots.has(timeKey)) {
            foundSlot = false;
            level++;
            break;
          }
        }
      }

      for (let time = Math.floor(start); time <= Math.ceil(end); time += 1) {
        timeSlots.set(`${level}_${time}`, currentId);
      }

      overlaps.set(currentId, level);
    }

    return overlaps;
  };

  // Fonctions de gestion des colonnes visibles
  const handleColumnVisibilityChange = (columnIndex: number) => {
    setColumnVisibility(prev => 
      prev.map(col => 
        col.index === columnIndex 
          ? { ...col, visible: !col.visible }
          : col
      )
    );
  };
  const getVisibleColumns = () => {
    return columnVisibility
      .filter(col => col.visible)
      .map(col => col.index);
  };

  const resetColumnVisibility = () => {
    setColumnVisibility(prev => 
      prev.map((col, index) => ({
        ...col,
        visible: [0,1,2,3,4,5,10,11,15,16].includes(index)
      }))
    );
  };

  const filteredData = data.filter(row => {
    return headers.every((header, index) => {
      const filterValue = (filters[header] || '').toLowerCase();
      const cellValue = (row[index] || '').toString().toLowerCase();
      return !filterValue || cellValue.includes(filterValue);
    });
  });

  // Fonction de gestion des filtres
  const handleFilterChange = (header: string, value: string): void => {
    setFilters(prev => ({
      ...prev,
      [header]: value
    }));
  };

  // Fonction modifiée pour le regroupement des données
  const groupDataByType = useCallback((groupBy: string, filteredDataForDate: string[][]): GroupData => {
    let groupIndex: number;
    let labelIndex: number;
    let groups: string[] = [];
    
    // Obtenir uniquement les tâches non affectées qui ne sont pas dans filteredDataForDate
    const unassignedTasks = data
      .filter(row => (!row[2] || !row[4]) && // Pas de date de début ou de fin
              !filteredDataForDate.some(filterRow => 
                getOperationId(filterRow) === getOperationId(row)
              ));

    switch (groupBy) {
      case 'Véhicule':
        groupIndex = 0;
        labelIndex = 1;
        groups = Array.from(new Set(filteredDataForDate.map(row => row[groupIndex])))
          .filter(Boolean)
          .sort();
        break;
      case 'Lieu':
        groupIndex = 10;
        labelIndex = 1;
        groups = Array.from(new Set(filteredDataForDate.map(row => row[groupIndex])))
          .filter(Boolean)
          .sort();
        break;
      case 'Technicien':
        groupIndex = 15;
        labelIndex = 15;
        // Pour la vue Technicien, on utilise tous les techniciens disponibles
        groups = allTechnicians.filter(tech => tech !== "Sans technicien");
        // Ajouter "Sans technicien" à la fin si nécessaire
        if (allTechnicians.includes("Sans technicien")) {
          groups.push("Sans technicien");
        }
        break;
      default:
        return { groups: [], groupIndex: 0, labelIndex: 0, unassignedTasks: [] };
    }

    // Ajouter le groupe "Non affectées" seulement s'il y a des tâches non affectées
    if (unassignedTasks.length > 0 && !groups.includes("Non affectées")) {
      groups.push("Non affectées");
    }

    return { groups, groupIndex, labelIndex, unassignedTasks };
  }, [allTechnicians, data]);

  // Fonction de filtrage des données par date mise à jour
  const filterDataForDate = useCallback((dateStr: string, operationId: string | null = null): string[][] => {
    if (!dateStr || !data.length) return [];

    try {
      const dateObj = new Date(dateStr);
      dateObj.setHours(0, 0, 0, 0);

      let filteredByDate = data.filter((row: string[]) => {
        // Si un operationId est spécifié, ne retourner que cette tâche
        if (operationId) {
          return getOperationId(row) === operationId;
        }

        // Si la tâche n'a pas de date, ne pas l'inclure dans le filtre par date
        if (!row[2] || !row[4]) return false;

        try {
          const startDate = new Date(row[2]);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(row[4]);
          endDate.setHours(23, 59, 59, 999);
          
          // La tâche est visible si la date sélectionnée est entre la date de début et de fin
          return startDate <= dateObj && dateObj <= endDate;
        } catch (err) {
          console.error('Erreur lors du filtrage des dates:', err);
          return false;
        }
      });

      return filteredByDate;
    } catch (err) {
      console.error('Erreur lors du filtrage des données:', err);
      return [];
    }
  }, [data]);

  // Fonctions d'édition
  const handleInputChange = (header: string, value: string): void => {
    setEditedData(prev => ({
      ...prev,
      [header]: value
    }));
  };

  const handleEditClick = (row: string[]): void => {
    const operationId = getOperationId(row);
    setEditingRow(operationId);
    const rowData: Record<string, string> = {};
    headers.forEach((header, index) => {
      rowData[header] = row[index] || '';
    });
    setEditedData(rowData);
  };

  const handleCancelEdit = (): void => {
    setEditingRow(null);
    setEditedData({});
  };

  const handleSaveEdit = (operationId: string): void => {
    const updatedRow = headers.map(header => editedData[header] || '');
    setData(prevData => 
      prevData.map(row => getOperationId(row) === operationId ? updatedRow : row)
    );
    setEditingRow(null);
    setEditedData({});
  };
  // Gestion des fichiers CSV
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    parse(file, {
      complete: (results: CSVResult) => {
        const processedData = results.data.slice(1)
          .filter((row: string[]) => row.some(cell => cell))
          .map((row: string[]) => {
            const updatedRow = [...row];
            updatedRow[15] = updatedRow[15]?.trim() || "Sans technicien";

            if (updatedRow[2] && updatedRow[4]) {
              const startDate = new Date(updatedRow[2]);
              const endDate = new Date(updatedRow[4]);
              updatedRow[2] = startDate.toISOString().split('T')[0];
              updatedRow[4] = endDate.toISOString().split('T')[0];

              // S'assurer que les heures sont au format correct pour les tâches multi-jours
              if (!updatedRow[3]) updatedRow[3] = '08:00';
              if (!updatedRow[5]) updatedRow[5] = '17:00';
            }
            return updatedRow;
          });

        setData(processedData);
        setHeaders(results.data[0]);

        // Utilisation de Set pour les dates et techniciens uniques
        const allDatesSet = new Set<string>();
        const technicianSet = new Set<string>();

        processedData.forEach((row: string[]) => {
          if (row[2] && row[4]) {
            const startDate = new Date(row[2]);
            const endDate = new Date(row[4]);

            // Génération de toutes les dates entre début et fin pour les tâches multi-jours
            for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
              allDatesSet.add(date.toISOString().split('T')[0]);
            }
          }
          if (row[15]) {
            technicianSet.add(row[15].trim());
          }
        });

        // Conversion des Sets en Arrays et tri
        const sortedDates = Array.from(allDatesSet)
          .filter(date => date)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        // Gestion des techniciens : on conserve tous les techniciens, même sans tâches
        const sortedTechnicians = Array.from(technicianSet)
          .filter(tech => tech && tech !== "Sans technicien")
          .sort((a, b) => a.localeCompare(b));

        // Ajout de "Sans technicien" à la fin
        if (technicianSet.has("Sans technicien")) {
          sortedTechnicians.push("Sans technicien");
        }

        setUniqueDates(sortedDates);
        setAllTechnicians(sortedTechnicians);

        const initialFilters: Record<string, string> = {};
        results.data[0].forEach(header => {
          initialFilters[header] = '';
        });
        setFilters(initialFilters);
      },
      error: (error: Error) => {
        console.error('Erreur lors de la lecture du fichier:', error);
      }
    });
  };

  const handleExportCSV = (): void => {
    const dataToExport = isFiltering ? filteredData : data;
    const csv = unparse({
      fields: headers,
      data: dataToExport
    });
    const fileName = `export_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, fileName);
  };

  const downloadCSV = (content: string, fileName: string): void => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleAddTechnician = (): void => {
    const trimmedTechnician = newTechnician.trim();
    if (trimmedTechnician && trimmedTechnician.toLowerCase() !== 'sans technicien') {
      setAllTechnicians(prev => {
        if (prev.includes(trimmedTechnician)) {
          return prev;
        }
        // On ajoute le nouveau technicien en conservant le tri
        const technicians = prev.filter(tech => tech !== "Sans technicien");
        technicians.push(trimmedTechnician);
        technicians.sort((a, b) => a.localeCompare(b));
        // On s'assure que "Sans technicien" reste à la fin
        if (prev.includes("Sans technicien")) {
          technicians.push("Sans technicien");
        }
        return technicians;
      });
      setNewTechnician('');
    }
  };

  // Gestion du drag & drop et interactions
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, task: TaskData): void => {
    e.stopPropagation();
    const taskData: DraggedTaskData = {
      ...task,
      date: selectedDate,
      operationId: getOperationId(task.task),
      startDate: task.task[2] || null,
      endDate: task.task[4] || null,
      originalTechnician: task.task[15],
      startPercentage: task.startPercentage,
      duration: task.duration
    };

    setDraggedTask(taskData);

    const ghostElement = document.createElement('div');
    ghostElement.style.width = '100px';
    ghostElement.style.height = '30px';
    ghostElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    ghostElement.style.position = 'absolute';
    ghostElement.style.top = '-1000px';
    document.body.appendChild(ghostElement);

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(ghostElement, 50, 15);

    requestAnimationFrame(() => {
      document.body.removeChild(ghostElement);
    });
  };
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>, technicianId: string): void => {
    e.preventDefault();
    e.stopPropagation();
    setDropZoneActive(technicianId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>, technicianId: string): void => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneActive === technicianId) {
      setDropZoneActive(null);
    }
  }, [dropZoneActive]);

  const handleDragEnd = useCallback((): void => {
    setDraggedTask(null);
    setDropZoneActive(null);
  }, []);

  const updateAssignment = useCallback((operationId: string, newTechnician: string): void => {
    setData(prevData => {
      return prevData.map(row => {
        if (getOperationId(row) === operationId) {
          const newRow = [...row];
          newRow[15] = newTechnician;
          return newRow;
        }
        return row;
      });
    });
  }, []);

  const assignDateToTask = (task: string[], targetDate: string): string[] => {
    const updatedTask = [...task];
    updatedTask[2] = targetDate;  // Date de début
    updatedTask[3] = '08:00';     // Heure de début par défaut
    updatedTask[4] = targetDate;  // Date de fin
    updatedTask[5] = '17:00';     // Heure de fin par défaut (journée complète)
    return updatedTask;
  };

  const handleDrop = useCallback((targetGroup: string, e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedTask || !draggedTask.operationId) {
      setDropZoneActive(null);
      return;
    }

    const { operationId, task: draggedTaskData, startDate, endDate, originalTechnician } = draggedTask;

    // Si on déplace vers "Non affectées", on ne fait rien
    if (targetGroup === "Non affectées") {
      setDropZoneActive(null);
      setDraggedTask(null);
      return;
    }

    const isUnassignedTask = !startDate || !endDate;

    if (isUnassignedTask) {
      const updatedTask = assignDateToTask(draggedTaskData, selectedDate);
      updatedTask[15] = targetGroup;

      setData(prevData => {
        return prevData.map(row => 
          getOperationId(row) === operationId ? updatedTask : row
        );
      });
    } else {
      const selectedDateObj = new Date(selectedDate);
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);

      // Vérifier si la date sélectionnée est dans la plage de dates de la tâche
      if (selectedDateObj < startDateObj || selectedDateObj > endDateObj) {
        console.log("Impossible de déplacer une tâche en dehors de sa période");
        setDropZoneActive(null);
        setDraggedTask(null);
        return;
      }

      if (originalTechnician === targetGroup) {
        setDropZoneActive(null);
        return;
      }

      updateAssignment(operationId, targetGroup);
    }

    setDropZoneActive(null);
    setDraggedTask(null);
  }, [draggedTask, selectedDate, updateAssignment]);

  const handleTaskClick = (operationId: string) => {
    setSelectedTask(prevTask => prevTask === operationId ? null : operationId);
  };

  // Messages de feedback pour le drag & drop
  const getDragMessage = (): React.ReactNode => {
    if (!draggedTask) return null;

    const isUnassigned = !draggedTask.startDate || !draggedTask.endDate;
    const isInValidDateRange = draggedTask.startDate && draggedTask.endDate && 
                              new Date(selectedDate) >= new Date(draggedTask.startDate) && 
                              new Date(selectedDate) <= new Date(draggedTask.endDate);

    return (
      <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 px-4 py-2 rounded-lg shadow-lg">
        {isUnassigned ? (
          "Glissez la tâche sur une ligne pour l'affecter à la date sélectionnée"
        ) : !isInValidDateRange ? (
          <span className="text-red-600">
            Impossible de déplacer une tâche en dehors de sa période ({draggedTask.startDate} - {draggedTask.endDate})
          </span>
        ) : (
          "Glissez la tâche sur une ligne pour réaffecter au technicien correspondant"
        )}
      </div>
    );
  };

  // Composants de rendu de base
  const renderCell = (row: string[], cell: string, header: string, index: number): React.ReactNode => {
    const operationId = getOperationId(row);
    const isEditing = editingRow === operationId;

    if (isEditing) {
      if (header.toLowerCase().includes('date')) {
        return (
          <input
            type="date"
            value={editedData[header] || ''}
            onChange={(e) => handleInputChange(header, e.target.value)}
            className="w-full p-1 border rounded"
          />
        );
      }
      if (header.toLowerCase().includes('heure')) {
        return (
          <input
            type="time"
            value={editedData[header] || ''}
            onChange={(e) => handleInputChange(header, e.target.value)}
            className="w-full p-1 border rounded"
          />
        );
      }
      return (
        <input
          type="text"
          value={editedData[header] || ''}
          onChange={(e) => handleInputChange(header, e.target.value)}
          className="w-full p-1 border rounded"
        />
      );
    }
    return cell || '';
  };
  const renderTimeHeader = ({ HEADER_HEIGHT }: Pick<RenderProps, 'HEADER_HEIGHT'>): React.ReactNode => (
    <div style={{ 
      height: `${HEADER_HEIGHT}px`, 
      borderBottom: '2px solid #333', 
      backgroundColor: '#f0f0f0', 
      position: 'relative'
    }}>
      {Array.from({ length: 24 }).map((_, index) => (
        <div key={index} style={{ 
          position: 'absolute', 
          left: `${index * (100 / 24)}%`, 
          height: '100%', 
          borderLeft: '1px solid #ccc',
          width: '1px'
        }}>
          <span style={{ 
            position: 'absolute', 
            bottom: '5px', 
            left: '-15px', 
            fontSize: '12px',
            width: '30px',
            textAlign: 'center'
          }}>
            {`${index.toString().padStart(2, '0')}:00`}
          </span>
        </div>
      ))}
    </div>
  );

  const renderGanttChart = (groupBy: string): React.ReactNode => {
    if (!selectedDate) {
      return <p>Veuillez sélectionner une date</p>;
    }

    const BASE_ROW_HEIGHT = 60;
    const HEADER_HEIGHT = 40;
    const TASK_HEIGHT = 20;
    const TASK_MARGIN = 4;
    const MIN_ROW_HEIGHT = BASE_ROW_HEIGHT;

    const filteredDataForDate = filterDataForDate(selectedDate);
    const { groups = [], groupIndex = 0, labelIndex = 0, unassignedTasks = [] } = 
      groupDataByType(groupBy, filteredDataForDate) || {};

    // Pour la vue Technicien, on continue même s'il n'y a pas de données
    if (!groups.length && !unassignedTasks.length && groupBy !== 'Technicien') {
      return <p>Aucune donnée à afficher pour cette date</p>;
    }

    const groupedData: GanttChartData[] = groups.map(group => {
      let tasks: TaskData[];
      
      if (group === "Non affectées") {
        tasks = unassignedTasks.map(task => ({
          task,
          startPercentage: 33.33, // 8h du matin en pourcentage
          duration: 33.33,        // Durée par défaut pour les tâches non affectées
          operationId: getOperationId(task),
          isMultiDay: false,
          isStart: true,
          isEnd: true,
          isUnassigned: true
        }));
      } else {
        tasks = filteredDataForDate
          .filter(row => row && row[groupIndex] === group)
          .map(task => {
            const hasStartAndEnd = Boolean(task[2] && task[4]);
            const isMultiDay = hasStartAndEnd ? !isSameDay(task[2], task[4]) : false;
            const isStart = hasStartAndEnd ? isSameDay(task[2], selectedDate) : false;
            const isEnd = hasStartAndEnd ? isSameDay(task[4], selectedDate) : false;

            // Utiliser calculateTaskTiming pour déterminer la position et la durée
            const { startPercentage, duration } = calculateTaskTiming(task, selectedDate);

            return {
              task,
              startPercentage,
              duration,
              operationId: getOperationId(task),
              isMultiDay,
              isStart,
              isEnd,
              isUnassigned: false
            };
          });
      }

      const overlaps = detectOverlaps(tasks);
      const maxOverlap = Math.max(0, ...Array.from(overlaps.values()));
      const rowHeight = Math.max(MIN_ROW_HEIGHT, (maxOverlap + 1) * (TASK_HEIGHT + TASK_MARGIN) + TASK_MARGIN * 2);

      return {
        group,
        tasks,
        overlaps,
        rowHeight,
        isUnassignedGroup: group === "Non affectées"
      };
    });

    return (
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <div style={{ display: 'flex', minWidth: '1000px' }}>
          {/* Colonne des groupes */}
          <div className="sticky left-0 z-10" style={{ width: '200px', borderRight: '2px solid #333', backgroundColor: '#f0f0f0' }}>
            <div style={{ height: `${HEADER_HEIGHT}px`, borderBottom: '2px solid #333', padding: '0 10px' }} 
                 className="flex items-center font-bold">
              {groupBy}
            </div>
            {groupedData.map(({ group, rowHeight, isUnassignedGroup }, index) => (
              <div 
                key={group} 
                style={{ height: `${rowHeight}px` }}
                className={`
                  flex items-center px-2.5 border-b border-gray-200
                  ${isUnassignedGroup ? 'bg-yellow-50' : index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                  ${group === 'Sans technicien' ? 'text-red-500' : ''}
                `}
              >
                {group || 'N/A'}
              </div>
            ))}
          </div>

          {/* Zone de contenu */}
          <div style={{ flex: 1, position: 'relative' }}>
            {renderTimeHeader({ HEADER_HEIGHT })}
            {groupedData.map(({ group, tasks, overlaps, rowHeight, isUnassignedGroup }, index) => (
              <div 
                key={group}
                style={{ height: `${rowHeight}px` }}
                className={`
                  relative border-b border-gray-200
                  ${dropZoneActive === group ? 'bg-blue-50' : 
                    isUnassignedGroup ? 'bg-yellow-50' : 
                    index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                `}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, group)}
                onDragLeave={(e) => handleDragLeave(e, group)}
                onDrop={(e) => handleDrop(group, e)}
              >
                {tasks.map((taskData) => {
                  const verticalPosition = overlaps.get(taskData.operationId) || 0;
                  return (
                    <div
                      key={`${taskData.operationId}_${selectedDate}`}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, taskData)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleTaskClick(taskData.operationId)}
                      style={{
                        position: 'absolute',
                        left: `${taskData.startPercentage}%`,
                        width: `${taskData.duration}%`,
                        height: `${TASK_HEIGHT}px`,
                        top: TASK_MARGIN + (verticalPosition * (TASK_HEIGHT + TASK_MARGIN)),
                        backgroundColor: taskData.isUnassigned ? '#FCD34D' : getUniqueColor(tasks.indexOf(taskData)),
                        borderLeft: !taskData.isStart ? '4px solid rgba(0,0,0,0.3)' : undefined,
                        borderRight: !taskData.isEnd ? '4px solid rgba(0,0,0,0.3)' : undefined,
                        cursor: 'pointer',
                        outline: selectedTask === taskData.operationId ? '2px solid yellow' : undefined,
                        boxShadow: selectedTask === taskData.operationId ? '0 0 0 2px yellow' : undefined,
                      }}
                      className={`
                        rounded px-1 text-xs text-white overflow-hidden whitespace-nowrap select-none
                        hover:brightness-90 transition-all duration-200
                        ${taskData.isUnassigned ? 'text-black' : ''}
                      `}
                    >
                      {renderGanttTaskContent({
                        task: taskData.task,
                        groupBy,
                        labelIndex
                      })}
                    </div>
                  );
                })}
                {tasks.length === 0 && groupBy === 'Technicien' && !isUnassignedGroup && (
                  <div className="h-full w-full flex items-center justify-center text-gray-400 italic">
                    Aucune tâche assignée
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  const renderGanttView = (groupBy: string, showTechnicianInput: boolean = false) => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        {renderDateSelector()}
        {showTechnicianInput && renderTechnicianInput()}
      </div>

      <div className="space-y-6">
        <div className="relative bg-white rounded-lg shadow-sm">
          {renderGanttChart(groupBy)}
        </div>
        
        {draggedTask && getDragMessage()}
        
        <div className="text-sm text-gray-500 italic space-y-1">
          {showTechnicianInput && (
            <p>Les tâches sans technicien sont affichées en rouge au bas du planning.</p>
          )}
          <p>Les tâches sur plusieurs jours sont indiquées par des bordures spéciales :</p>
          <ul className="list-disc pl-6">
            <li>Bordure gauche : début de la tâche sur un jour précédent</li>
            <li>Bordure droite : fin de la tâche sur un jour suivant</li>
            <li>Les deux bordures : tâche s'étendant sur plusieurs jours</li>
          </ul>
          <p>Les tâches non planifiées sont affichées en jaune et peuvent être glissées sur le planning pour leur assigner une date.</p>
        </div>

        {selectedDate && (
          <div className="mt-8 border-t-2 border-gray-200 pt-8">
            {renderFilterReset()}
            <h3 className="text-lg font-semibold mb-4">
              {selectedTask 
                ? "Détails de l'opération sélectionnée"
                : `Détails des opérations pour le ${selectedDate}`}
            </h3>
            {renderTable(filterDataForDate(selectedDate, selectedTask))}
          </div>
        )}
      </div>
    </div>
  );

  // Configuration des onglets
  const tabContent = [
    { 
      title: 'Tableau', 
      content: renderTable(filteredData) 
    },
    {
      title: 'Vue Véhicule',
      content: renderGanttView('Véhicule')
    },
    {
      title: 'Vue Lieu',
      content: renderGanttView('Lieu')
    },
    {
      title: 'Vue Technicien',
      content: renderGanttView('Technicien', true)
    },
    {
      title: 'Paramètres',
      content: renderSettings()
    }
  ];

  const renderTabButtons = (): React.ReactNode => (
    <div className="flex flex-wrap gap-2">
      {['Tableau', 'Vue Véhicule', 'Vue Lieu', 'Vue Technicien', 'Paramètres'].map((title, index) => (
        <button
          key={index}
          onClick={() => setActiveTab(index)}
          className={`
            px-4 py-2 rounded-lg transition-all duration-200 flex items-center gap-2
            ${activeTab === index 
              ? 'bg-blue-500 text-white shadow-md scale-105' 
              : 'bg-white hover:bg-gray-100'
            }
          `}
        >
          {title === 'Paramètres' && <Settings className="h-4 w-4" />}
          {title}
        </button>
      ))}
    </div>
  );

  const renderDateSelector = (): React.ReactNode => (
    <select 
      value={selectedDate} 
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDate(e.target.value)}
      className="w-full md:w-auto p-2 border rounded"
    >
      <option value="">Sélectionnez une date</option>
      {uniqueDates.map(date => (
        <option key={date} value={date}>{date}</option>
      ))}
    </select>
  );

  // Rendu principal du composant
  return (
    <div className="container mx-auto p-4 min-h-screen bg-gray-50">
      <div className="mb-6 space-y-4">
        {/* Section upload de fichier */}
        <div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm">
          <input 
            type="file" 
            onChange={handleFileUpload} 
            accept=".csv" 
            className="flex-1"
          />
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 
                   transition-colors duration-200 flex items-center gap-2"
          >
            Exporter CSV
          </button>
        </div>

        {/* Onglets */}
        {renderTabButtons()}
      </div>

      {/* Contenu principal */}
      <Card>
        <CardContent>
          {tabContent[activeTab].content}
        </CardContent>
      </Card>
    </div>
  );
};

// Mémo du composant pour de meilleures performances
const MemoizedCSVViewer = React.memo(CSVViewer);

// Export par défaut du composant
export default MemoizedCSVViewer;
