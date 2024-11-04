'use client';

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { parse, unparse } from 'papaparse';
import { Edit2, Save, X, Settings, PlusCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  dayStartPercentage?: number;
  dayEndPercentage?: number;
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

interface RenderProps {
  HEADER_HEIGHT: number;
  task: string[];
  groupBy: string;
  labelIndex: number;
}

interface NewOperation {
  vehicule: string;
  description: string;
  dateDebut: string;
  heureDebut: string;
  dateFin: string;
  heureFin: string;
  lieu: string;
  technicien: string;
}

// Fonction de formatage des dates
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  
  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
};

// État initial pour une nouvelle opération
const initialNewOperation: NewOperation = {
  vehicule: '',
  description: '',
  dateDebut: '',
  heureDebut: '08:00',
  dateFin: '',
  heureFin: '09:00',
  lieu: '',
  technicien: ''
};
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
  // Nouveaux états pour la création d'opération
  const [isNewOperationDialogOpen, setIsNewOperationDialogOpen] = useState<boolean>(false);
  const [newOperation, setNewOperation] = useState<NewOperation>(initialNewOperation);

  // useEffects
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

  // Fonction pour créer une nouvelle opération
  const handleCreateOperation = () => {
    // Créer un nouvel array avec les données de l'opération
    const newRow = new Array(headers.length).fill('');
    newRow[0] = newOperation.vehicule;
    newRow[1] = newOperation.description;
    newRow[2] = newOperation.dateDebut;
    newRow[3] = newOperation.heureDebut;
    newRow[4] = newOperation.dateFin;
    newRow[5] = newOperation.heureFin;
    newRow[10] = newOperation.lieu;
    newRow[15] = newOperation.technicien || "Sans technicien";

    // Ajouter la nouvelle opération aux données
    setData(prevData => [...prevData, newRow]);

    // Mettre à jour les dates uniques si nécessaire
    if (newOperation.dateDebut && newOperation.dateFin) {
      const newDates = generateDateRange(
        new Date(newOperation.dateDebut),
        new Date(newOperation.dateFin)
      );
      setUniqueDates(prevDates => {
        const allDates = new Set([...prevDates, ...newDates]);
        return Array.from(allDates).sort();
      });
    }

    // Réinitialiser le formulaire
    setNewOperation(initialNewOperation);
    setIsNewOperationDialogOpen(false);
  };

  const handleNewOperationChange = (
    field: keyof NewOperation,
    value: string
  ): void => {
    setNewOperation(prev => ({
      ...prev,
      [field]: value,
      // Si on modifie la date de début, mettre à jour la date de fin si elle n'est pas définie
      ...(field === 'dateDebut' && !prev.dateFin && { dateFin: value })
    }));
  };
  // Fonctions de gestion du temps
  const getTimePercentage = (time: string): number => {
    if (!time) return 33.33; // 8:00 par défaut
    try {
      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) return 33.33;
      return ((hours * 60 + minutes) / (24 * 60)) * 100;
    } catch (err) {
      console.error('Erreur lors du calcul du pourcentage de temps:', err);
      return 33.33;
    }
  };

  const calculateDuration = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 4.17; // ~1 heure par défaut

    try {
      const startPercentage = getTimePercentage(startTime);
      const endPercentage = getTimePercentage(endTime);
      
      return endPercentage - startPercentage;
    } catch (err) {
      console.error('Erreur lors du calcul de la durée:', err);
      return 4.17;
    }
  };

  const calculateDayPercentages = useCallback((
    task: string[], 
    selectedDate: string
  ): { dayStartPercentage: number; dayEndPercentage: number } => {
    if (!task[2] || !task[4]) {
      const hasTime = Boolean(task[3] && task[5]);
      return { 
        dayStartPercentage: hasTime ? getTimePercentage(task[3]) : 33.33,
        dayEndPercentage: hasTime ? getTimePercentage(task[5]) : 37.5
      };
    }
    
    if (isSameDay(task[2], task[4])) {
      return {
        dayStartPercentage: getTimePercentage(task[3]),
        dayEndPercentage: getTimePercentage(task[5])
      };
    }
    
    if (isSameDay(selectedDate, task[2])) {
      return {
        dayStartPercentage: getTimePercentage(task[3]),
        dayEndPercentage: 100
      };
    } else if (isSameDay(selectedDate, task[4])) {
      return {
        dayStartPercentage: 0,
        dayEndPercentage: getTimePercentage(task[5])
      };
    } else {
      return {
        dayStartPercentage: 0,
        dayEndPercentage: 100
      };
    }
  }, []);

  const detectOverlaps = useCallback((tasks: TaskData[]): Map<string, number> => {
    const sortedTasks = [...tasks].sort((a, b) => {
      const aStart = a.dayStartPercentage ?? a.startPercentage;
      const bStart = b.dayStartPercentage ?? b.startPercentage;
      
      if (aStart === bStart) {
        const aEnd = a.dayEndPercentage ?? (a.startPercentage + a.duration);
        const bEnd = b.dayEndPercentage ?? (b.startPercentage + b.duration);
        return bEnd - aEnd;
      }
      return aStart - bStart;
    });

    const overlaps = new Map<string, number>();
    const timeSlots = new Map<string, string>();

    for (const task of sortedTasks) {
      const currentId = getOperationId(task.task);
      const start = task.dayStartPercentage ?? task.startPercentage;
      const end = task.dayEndPercentage ?? (task.startPercentage + task.duration);

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
  }, []);

  // Validation du formulaire de nouvelle opération
  const validateNewOperation = (): boolean => {
    const {
      vehicule,
      description,
      dateDebut,
      heureDebut,
      dateFin,
      heureFin,
      lieu,
      technicien
    } = newOperation;

    // Vérification des champs requis
    if (!vehicule || !description || !dateDebut || !dateFin || !lieu) {
      return false;
    }

    // Vérification des dates et heures
    const start = new Date(`${dateDebut}T${heureDebut}`);
    const end = new Date(`${dateFin}T${heureFin}`);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return false;
    }

    return true;
  };

  // Fonction pour générer la plage de dates
  const generateDateRange = (start: Date, end: Date): string[] => {
    const dates: string[] = [];
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    
    while (current <= endDate) {
      dates.push(new Date(current).toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  };
  // Fonctions de gestion des données
  const filterDataForDate = useCallback((dateStr: string, operationId: string | null = null): string[][] => {
    if (!dateStr || !data.length) return [];

    try {
      const dateObj = new Date(dateStr);
      dateObj.setHours(0, 0, 0, 0);

      let filteredByDate = data.filter((row: string[]) => {
        if (operationId) {
          return getOperationId(row) === operationId;
        }

        if (!row[2] || !row[4]) return false;

        try {
          const startDate = new Date(row[2]);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(row[4]);
          endDate.setHours(23, 59, 59, 999);
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

  const groupDataByType = useCallback((groupBy: string, filteredDataForDate: string[][]): GroupData => {
    let groupIndex: number;
    let labelIndex: number;
    let groups: string[] = [];
    
    const unassignedTasks = data
      .filter(row => (!row[2] || !row[4]) && 
              !filteredDataForDate.some(filterRow => 
                getOperationId(filterRow) === getOperationId(row)
              ));

    switch (groupBy) {
      case 'Véhicule':
        groupIndex = 0;
        labelIndex = 1;
        groups = Array.from(new Set(data.map(row => row[groupIndex])))
          .filter(Boolean)
          .sort();
        break;
      case 'Lieu':
        groupIndex = 10;
        labelIndex = 1;
        groups = Array.from(new Set(data.map(row => row[groupIndex])))
          .filter(Boolean)
          .sort();
        break;
      case 'Technicien':
        groupIndex = 15;
        labelIndex = 15;
        groups = allTechnicians.filter(tech => tech !== "Sans technicien");
        if (allTechnicians.includes("Sans technicien")) {
          groups.push("Sans technicien");
        }
        break;
      default:
        return { groups: [], groupIndex: 0, labelIndex: 0, unassignedTasks: [] };
    }

    if (unassignedTasks.length > 0 && !groups.includes("Non affectées")) {
      groups.push("Non affectées");
    }

    return { groups, groupIndex, labelIndex, unassignedTasks };
  }, [allTechnicians, data]);

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
    setData(prevData => 
      prevData.map(row => getOperationId(row) === operationId 
        ? headers.map(header => editedData[header] || '')
        : row
      )
    );
    setEditingRow(null);
    setEditedData({});
  };

  // Fonctions de gestion des colonnes
  const handleFilterChange = (header: string, value: string): void => {
    setFilters(prev => ({
      ...prev,
      [header]: value
    }));
  };

  const handleColumnVisibilityChange = (columnIndex: number): void => {
    setColumnVisibility(prev => 
      prev.map(col => 
        col.index === columnIndex 
          ? { ...col, visible: !col.visible }
          : col
      )
    );
  };

  const getVisibleColumns = (): number[] => {
    return columnVisibility
      .filter(col => col.visible)
      .map(col => col.index);
  };

  const resetColumnVisibility = (): void => {
    setColumnVisibility(prev => 
      prev.map((col, index) => ({
        ...col,
        visible: [0,1,2,3,4,5,10,11,15,16].includes(index)
      }))
    );
  };

  // Fonction modifiée pour gérer les filtres de données
  const filteredData = data.filter(row => {
    return headers.every((header, index) => {
      const filterValue = (filters[header] || '').toLowerCase();
      const cellValue = (row[index] || '').toString().toLowerCase();
      return !filterValue || cellValue.includes(filterValue);
    });
  });
  // Gestion du drag & drop
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, task: TaskData): void => {
    e.stopPropagation();
    const taskData: DraggedTaskData = {
      task: task.task,
      date: selectedDate,
      operationId: getOperationId(task.task),
      startDate: task.task[2] || null,
      endDate: task.task[4] || null,
      originalTechnician: task.task[15],
      startPercentage: task.isUnassigned && task.task[3] && task.task[5] 
        ? getTimePercentage(task.task[3])
        : task.dayStartPercentage ?? task.startPercentage,
      duration: task.isUnassigned && task.task[3] && task.task[5]
        ? calculateDuration(task.task[3], task.task[5])
        : task.dayEndPercentage 
          ? task.dayEndPercentage - (task.dayStartPercentage ?? 0)
          : task.duration
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

  const handleDrop = useCallback((targetGroup: string, e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedTask || !draggedTask.operationId) {
      setDropZoneActive(null);
      return;
    }

    const { operationId, task: draggedTaskData, startDate, endDate, originalTechnician } = draggedTask;

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
  }, [draggedTask, selectedDate, updateAssignment, assignDateToTask]);

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
            }
            return updatedRow;
          });

        setData(processedData);
        setHeaders(results.data[0]);

        // Mise à jour des dates et des techniciens
        const allDates = new Set<string>();
        const technicianSet = new Set<string>();

        processedData.forEach((row: string[]) => {
          if (row[2] && row[4]) {
            const startDate = new Date(row[2]);
            const endDate = new Date(row[4]);
            const dates = generateDateRange(startDate, endDate);
            dates.forEach(date => allDates.add(date));
          }
          if (row[15]) {
            technicianSet.add(row[15].trim());
          }
        });

        setUniqueDates(Array.from(allDates).sort());
        
        const sortedTechnicians = Array.from(technicianSet)
          .filter(tech => tech && tech !== "Sans technicien")
          .sort((a, b) => a.localeCompare(b));

        if (technicianSet.has("Sans technicien")) {
          sortedTechnicians.push("Sans technicien");
        }

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

  const handleTaskClick = (operationId: string): void => {
    setSelectedTask(prevTask => prevTask === operationId ? null : operationId);
  };

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

  // Composant de dialogue pour nouvelle opération
const renderNewOperationDialog = (): React.ReactNode => (
  <Dialog open={isNewOperationDialogOpen} onOpenChange={setIsNewOperationDialogOpen}>
    <Dialog.Content className="sm:max-w-[600px]">
      <Dialog.Header>
        <Dialog.Title>Créer une nouvelle opération</Dialog.Title>
        <Dialog.Description>
          Remplissez les informations pour créer une nouvelle opération de maintenance.
        </Dialog.Description>
      </Dialog.Header>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="vehicule" className="text-right">
            Véhicule
          </Label>
          <Input
            id="vehicule"
            value={newOperation.vehicule}
            onChange={(e) => handleNewOperationChange('vehicule', e.target.value)}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="description" className="text-right">
            Description
          </Label>
          <Input
            id="description"
            value={newOperation.description}
            onChange={(e) => handleNewOperationChange('description', e.target.value)}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="dateDebut" className="text-right">
            Date de début
          </Label>
          <div className="col-span-3 grid grid-cols-2 gap-2">
            <Input
              id="dateDebut"
              type="date"
              value={newOperation.dateDebut}
              onChange={(e) => handleNewOperationChange('dateDebut', e.target.value)}
            />
            <Input
              type="time"
              value={newOperation.heureDebut}
              onChange={(e) => handleNewOperationChange('heureDebut', e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="dateFin" className="text-right">
            Date de fin
          </Label>
          <div className="col-span-3 grid grid-cols-2 gap-2">
            <Input
              id="dateFin"
              type="date"
              value={newOperation.dateFin}
              onChange={(e) => handleNewOperationChange('dateFin', e.target.value)}
            />
            <Input
              type="time"
              value={newOperation.heureFin}
              onChange={(e) => handleNewOperationChange('heureFin', e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="lieu" className="text-right">
            Lieu
          </Label>
          <Input
            id="lieu"
            value={newOperation.lieu}
            onChange={(e) => handleNewOperationChange('lieu', e.target.value)}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="technicien" className="text-right">
            Technicien
          </Label>
          <select
            id="technicien"
            value={newOperation.technicien}
            onChange={(e) => handleNewOperationChange('technicien', e.target.value)}
            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Sélectionner un technicien</option>
            {allTechnicians.map((tech) => (
              <option key={tech} value={tech}>
                {tech}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-4">
        <Button
          variant="outline"
          onClick={() => setIsNewOperationDialogOpen(false)}
        >
          Annuler
        </Button>
        <Button
          onClick={handleCreateOperation}
          disabled={!validateNewOperation()}
        >
          Créer l'opération
        </Button>
      </div>
    </Dialog.Content>
  </Dialog>
);
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

  // Autres fonctions de rendu...
  const renderDateSelector = (): React.ReactNode => (
    <select 
      value={selectedDate} 
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDate(e.target.value)}
      className="w-full md:w-auto p-2 border rounded"
    >
      <option value="">Sélectionnez une date</option>
      {uniqueDates.map(date => (
        <option key={date} value={date}>
          {formatDate(date)}
        </option>
      ))}
    </select>
  );

 const renderTopActions = (): React.ReactNode => (
  <div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm">
    <input 
      type="file" 
      onChange={handleFileUpload} 
      accept=".csv" 
      className="flex-1"
    />
    <Button
      onClick={() => setIsNewOperationDialogOpen(true)}
      className="gap-2"
    >
      <PlusCircle className="h-4 w-4" />
      Nouvelle opération
    </Button>
    <Button
      onClick={handleExportCSV}
      className="gap-2"
      variant="outline"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Exporter CSV
    </Button>
  </div>
);
  // Rendu du Gantt Chart
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

    if (!groups.length && !unassignedTasks.length && groupBy !== 'Technicien') {
      return <p>Aucune donnée à afficher pour cette date</p>;
    }

    const groupedData: GanttChartData[] = groups.map(group => {
      let tasks: TaskData[];
      
      if (group === "Non affectées") {
        tasks = unassignedTasks.map(task => {
          const hasTime = Boolean(task[3] && task[5]);
          
          return {
            task,
            startPercentage: hasTime ? getTimePercentage(task[3]) : 33.33,
            duration: hasTime ? calculateDuration(task[3], task[5]) : 4.17,
            operationId: getOperationId(task),
            isMultiDay: false,
            isStart: true,
            isEnd: true,
            isUnassigned: true,
            dayStartPercentage: hasTime ? getTimePercentage(task[3]) : 33.33,
            dayEndPercentage: hasTime ? getTimePercentage(task[5]) : 37.50
          };
        });
      } else {
        tasks = filteredDataForDate
          .filter(row => row && row[groupIndex] === group)
          .map(task => {
            const hasStartAndEnd = Boolean(task[2] && task[4]);
            const isMultiDay = hasStartAndEnd ? !isSameDay(task[2], task[4]) : false;
            const isStart = hasStartAndEnd ? isSameDay(task[2], selectedDate) : false;
            const isEnd = hasStartAndEnd ? isSameDay(task[4], selectedDate) : false;

            const { dayStartPercentage, dayEndPercentage } = calculateDayPercentages(task, selectedDate);

            return {
              task,
              startPercentage: getTimePercentage(task[3]),
              duration: calculateDuration(task[3], task[5]),
              operationId: getOperationId(task),
              isMultiDay,
              isStart,
              isEnd,
              isUnassigned: false,
              dayStartPercentage,
              dayEndPercentage
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
                {tasks.map((taskData) => (
                  <div
                    key={`${taskData.operationId}_${selectedDate}`}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, taskData)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleTaskClick(taskData.operationId)}
                    style={{
                      position: 'absolute',
                      left: `${taskData.dayStartPercentage ?? taskData.startPercentage}%`,
                      width: `${(taskData.dayEndPercentage ?? (taskData.startPercentage + taskData.duration)) - 
                              (taskData.dayStartPercentage ?? taskData.startPercentage)}%`,
                      height: `${TASK_HEIGHT}px`,
                      top: TASK_MARGIN + ((overlaps.get(taskData.operationId) || 0) * (TASK_HEIGHT + TASK_MARGIN)),
                      backgroundColor: taskData.isUnassigned ? '#FCD34D' : getUniqueColor(tasks.indexOf(taskData)),
                      cursor: 'pointer',
                      outline: selectedTask === taskData.operationId ? '2px solid yellow' : undefined,
                      boxShadow: selectedTask === taskData.operationId ? '0 0 0 2px yellow' : undefined,
                    }}
                    className={`
                      rounded px-1 text-xs text-white overflow-hidden whitespace-nowrap select-none
                      hover:brightness-90 transition-all duration-200
                      ${taskData.isUnassigned ? 'text-black' : ''}
                      ${taskData.isMultiDay ? 'border-2 border-blue-300' : ''}
                    `}
                  >
                    {`${taskData.task[0] || 'N/A'} - ${taskData.task[1] || 'N/A'}`}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  const handleExportCSV = (): void => {
    const dataToExport = isFiltering ? filteredData : data;
    const csv = unparse({
      fields: headers,
      data: dataToExport
    });
    const fileName = `export_${selectedDate || new Date().toISOString().split('T')[0]}.csv`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const renderTable = (dataToRender: string[][]): React.ReactNode => {
    const visibleColumns = getVisibleColumns();
    
    return (
      <div className="w-full">
        <div className="flex justify-between items-center mb-4 p-4 bg-gray-50 rounded-lg">
          <h2 className="text-lg font-semibold">Vue Tableau</h2>
          <Button
            onClick={handleExportCSV}
            className="gap-2"
            variant="outline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exporter en CSV
          </Button>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="min-w-full border border-gray-300" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                {headers.map((header, index) => {
                  if (!visibleColumns.includes(index)) return null;
                  
                  return (
                    <th
                      key={index}
                      className="sticky top-0 bg-gray-800 text-white py-3 px-4 text-left text-xs font-medium border border-gray-600"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="truncate">{header}</span>
                        {isFiltering && (
                          <input
                            type="text"
                            value={filters[header] || ''}
                            onChange={(e) => handleFilterChange(header, e.target.value)}
                            placeholder={`Filtrer ${header}`}
                            className="w-full mt-1 p-1 text-sm border rounded bg-white text-gray-800"
                          />
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="sticky top-0 bg-gray-800 text-white py-3 px-4 text-left text-xs font-medium border border-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {dataToRender.map((row, rowIndex) => {
                const operationId = getOperationId(row);
                const isEditing = editingRow === operationId;
                const isUnassigned = !row[2] || !row[4];

                return (
                  <tr
                    key={operationId}
                    className={`
                      ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-100'}
                      ${isEditing ? 'bg-yellow-50' : ''}
                      ${isUnassigned ? 'bg-yellow-50' : ''}
                      hover:bg-blue-50
                    `}
                  >
                    {row.map((cell, cellIndex) => {
                      if (!visibleColumns.includes(cellIndex)) return null;
                      
                      return (
                        <td
                          key={cellIndex}
                          className="border border-gray-300 py-2 px-4 text-sm"
                        >
                          <div className="truncate">
                            {renderCell(row, cell, headers[cellIndex], cellIndex)}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border border-gray-300 py-2 px-4">
                      <div className="flex justify-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(operationId)}
                              className="bg-green-500 text-white p-1 rounded hover:bg-green-600"
                              title="Enregistrer"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="bg-red-500 text-white p-1 rounded hover:bg-red-600"
                              title="Annuler"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleEditClick(row)}
                            className="bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
                            title="Modifier"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <p>Les tâches sur plusieurs jours sont indiquées par des bordures spéciales.</p>
          <p>Les tâches non planifiées sont affichées en jaune et peuvent être glissées sur le planning pour leur assigner une date.</p>
        </div>

        {selectedDate && (
          <div className="mt-8 border-t-2 border-gray-200 pt-8">
            {renderFilterReset()}
            <h3 className="text-lg font-semibold mb-4">
              {selectedTask 
                ? "Détails de l'opération sélectionnée"
                : `Détails des opérations pour le ${formatDate(selectedDate)}`}
            </h3>
            {renderTable(filterDataForDate(selectedDate, selectedTask))}
          </div>
        )}
      </div>
    </div>
  );

  const renderFilterReset = (): React.ReactNode => {
    if (!selectedTask) return null;

    return (
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => setSelectedTask(null)}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 
                   transition-colors duration-200 flex items-center gap-2"
        >
          <X className="h-4 w-4" />
          Réinitialiser le filtre
        </button>
      </div>
    );
  };

  // Rendu final du composant
  return (
    <div className="container mx-auto p-4 min-h-screen bg-gray-50">
      <div className="mb-6 space-y-4">
        {/* Actions principales */}
        {renderTopActions()}

        {/* Dialogue de nouvelle opération */}
        {renderNewOperationDialog()}

        {/* Onglets */}
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
      </div>

      {/* Contenu principal */}
      <Card>
        <CardContent className="p-6">
          {activeTab === 0 && renderTable(filteredData)}
          {activeTab === 1 && renderGanttView('Véhicule')}
          {activeTab === 2 && renderGanttView('Lieu')}
          {activeTab === 3 && renderGanttView('Technicien', true)}
          {activeTab === 4 && renderSettings()}
        </CardContent>
      </Card>

      {draggedTask && getDragMessage()}
    </div>
  );
};

export default React.memo(CSVViewer);
