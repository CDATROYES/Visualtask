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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newOperation, setNewOperation] = useState<Record<string, string>>({});

  // ... Le reste du code suit
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
      return { 
        dayStartPercentage: 33.33,
        dayEndPercentage: 37.5
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
        groups = Array.from(new Set(filteredDataForDate.map(row => row[groupIndex])))
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

  // Création d'une nouvelle opération
  const handleCreateOperation = (): void => {
    const newRow = headers.map(header => {
      if (header.toLowerCase().includes('technicien')) {
        return newOperation[header] || 'Sans technicien';
      }
      return newOperation[header] || '';
    });
    
    setData(prev => [...prev, newRow]);
    setNewOperation({});
    setIsCreateModalOpen(false);
  };

  // Fonctions de filtrage
  const handleFilterChange = (header: string, value: string): void => {
    setFilters(prev => ({
      ...prev,
      [header]: value
    }));
  };

  // Gestion des colonnes
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

  // Assignation de date
  const assignDateToTask = (task: string[], targetDate: string): string[] => {
    const updatedTask = [...task];
    updatedTask[2] = targetDate;
    
    const hasTime = Boolean(task[3] && task[5]);
    if (hasTime) {
      updatedTask[3] = task[3];
      updatedTask[4] = targetDate;
      updatedTask[5] = task[5];
    } else {
      updatedTask[3] = '08:00';
      updatedTask[4] = targetDate;
      updatedTask[5] = '09:00';
    }
    
    return updatedTask;
  };

  // Gestion des techniciens
  const handleAddTechnician = (): void => {
    const trimmedTechnician = newTechnician.trim();
    if (trimmedTechnician && trimmedTechnician.toLowerCase() !== 'sans technicien') {
      setAllTechnicians(prev => {
        if (prev.includes(trimmedTechnician)) {
          return prev;
        }
        const technicians = prev.filter(tech => tech !== "Sans technicien");
        technicians.push(trimmedTechnician);
        technicians.sort((a, b) => a.localeCompare(b));
        if (prev.includes("Sans technicien")) {
          technicians.push("Sans technicien");
        }
        return technicians;
      });
      setNewTechnician('');
    }
  };

  // Filtrage des données
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

  const handleTaskClick = (operationId: string): void => {
    setSelectedTask(prevTask => prevTask === operationId ? null : operationId);
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
            }
            return updatedRow;
          });

        setData(processedData);
        setHeaders(results.data[0]);

        // Génération des dates et techniciens uniques
        const allDatesSet = new Set<string>();
        const technicianSet = new Set<string>();

        processedData.forEach((row: string[]) => {
          if (row[2] && row[4]) {
            const startDate = new Date(row[2]);
            const endDate = new Date(row[4]);
            
            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
              allDatesSet.add(currentDate.toISOString().split('T')[0]);
              currentDate.setDate(currentDate.getDate() + 1);
            }
          }
          if (row[15]) {
            technicianSet.add(row[15].trim());
          }
        });

        const sortedDates = Array.from(allDatesSet).sort();
        const sortedTechnicians = Array.from(technicianSet)
          .filter(tech => tech && tech !== "Sans technicien")
          .sort();

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
      if (header === headers[15]) { // Champ technicien
        return (
          <select
            value={editedData[header] || ''}
            onChange={(e) => handleInputChange(header, e.target.value)}
            className="w-full p-1 border rounded"
          >
            {allTechnicians.map(tech => (
              <option key={tech} value={tech}>{tech}</option>
            ))}
          </select>
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

  const renderGanttTaskContent = ({ task, groupBy, labelIndex }: Omit<RenderProps, 'HEADER_HEIGHT'>): React.ReactNode => {
    if (!task) return null;
    
    const isUnassigned = !task[2] || !task[4];
    
    if (groupBy === 'Technicien') {
      return (
        <div className="flex items-center gap-1 w-full overflow-hidden">
          <span className="truncate">
            {`${task[0] || 'N/A'} - ${task[1] || 'N/A'}`}
          </span>
          {isUnassigned ? (
            <span className="flex-shrink-0 text-xs bg-yellow-200 text-yellow-800 px-1 rounded">
              Non planifiée
            </span>
          ) : task[2] && task[4] && !isSameDay(task[2], task[4]) && (
            <span className="flex-shrink-0 text-xs bg-blue-200 text-blue-800 px-1 rounded">
              Multi-jours
            </span>
          )}
        </div>
      );
    }
    return task[labelIndex] || 'N/A';
  };

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

  const renderTechnicianInput = (): React.ReactNode => (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={newTechnician}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTechnician(e.target.value)}
        placeholder="Nouveau technicien"
        className="flex-1 min-w-[200px] p-2 border rounded"
      />
      <button
        onClick={handleAddTechnician}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 
                 transition-colors duration-200 whitespace-nowrap"
        disabled={newTechnician.trim().toLowerCase() === 'sans technicien'}
        title={newTechnician.trim().toLowerCase() === 'sans technicien' ? 
               "Impossible d'ajouter 'Sans technicien'" : ''}
      >
        Ajouter Technicien
      </button>
    </div>
  );

  const renderCreateModal = (): React.ReactNode => {
    if (!isCreateModalOpen) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Créer une nouvelle opération</h2>
            <button
              onClick={() => {
                setNewOperation({});
                setIsCreateModalOpen(false);
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {headers.map((header, index) => {
              if (!getVisibleColumns().includes(index)) return null;

              const inputProps = {
                value: newOperation[header] || '',
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => 
                  setNewOperation(prev => ({
                    ...prev,
                    [header]: e.target.value
                  })),
                className: "w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              };

              return (
                <div key={header} className="flex flex-col">
                  <label className="text-sm text-gray-600 mb-1">
                    {header}
                  </label>
                  
                  {header.toLowerCase().includes('date') ? (
                    <input 
                      type="date" 
                      {...inputProps} 
                    />
                  ) : header.toLowerCase().includes('heure') ? (
                    <input 
                      type="time" 
                      {...inputProps}
                    />
                  ) : header === headers[15] ? (
                    <select {...inputProps}>
                      <option value="">Sélectionner un technicien</option>
                      {allTechnicians.map(tech => (
                        <option key={tech} value={tech}>
                          {tech}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      type="text" 
                      {...inputProps}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={() => {
                setNewOperation({});
                setIsCreateModalOpen(false);
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleCreateOperation}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Créer
            </button>
          </div>
        </div>
      </div>
    );
  };
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
      <div className="relative rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            {/* En-tête avec la timeline */}
            <div className="sticky top-0 z-10 flex">
              {/* Colonne des groupes */}
              <div className="w-48 bg-gray-100 border-r border-gray-300">
                <div className="h-10 flex items-center px-4 font-semibold border-b border-gray-300">
                  {groupBy}
                </div>
              </div>
              
              {/* Timeline */}
              <div className="flex-1">
                {renderTimeHeader({ HEADER_HEIGHT })}
              </div>
            </div>

            {/* Contenu du Gantt */}
            {groupedData.map(({ group, tasks, overlaps, rowHeight, isUnassignedGroup }, index) => (
              <div 
                key={group}
                className="flex"
              >
                {/* Label du groupe */}
                <div 
                  className={`
                    w-48 px-4 border-r border-gray-300 flex items-center
                    ${isUnassignedGroup ? 'bg-yellow-50' : index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                  `}
                  style={{ height: `${rowHeight}px` }}
                >
                  <span className="truncate font-medium">
                    {group || 'N/A'}
                  </span>
                </div>

                {/* Zone des tâches */}
                <div 
                  className={`
                    relative flex-1 border-b border-gray-300
                    ${dropZoneActive === group ? 'bg-blue-50' : 
                      isUnassignedGroup ? 'bg-yellow-50' : 
                      index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                  `}
                  style={{ height: `${rowHeight}px` }}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, group)}
                  onDragLeave={(e) => handleDragLeave(e, group)}
                  onDrop={(e) => handleDrop(group, e)}
                >
                  {tasks.map((taskData) => {
                    const verticalPosition = overlaps.get(taskData.operationId) || 0;
                    const displayStartPercentage = taskData.dayStartPercentage ?? taskData.startPercentage;
                    const displayEndPercentage = taskData.dayEndPercentage ?? (taskData.startPercentage + taskData.duration);
                    const displayWidth = displayEndPercentage - displayStartPercentage;

                    return (
                      <div
                        key={`${taskData.operationId}_${selectedDate}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, taskData)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleTaskClick(taskData.operationId)}
                        style={{
                          position: 'absolute',
                          left: `${displayStartPercentage}%`,
                          width: `${displayWidth}%`,
                          height: `${TASK_HEIGHT}px`,
                          top: TASK_MARGIN + (verticalPosition * (TASK_HEIGHT + TASK_MARGIN)),
                          backgroundColor: taskData.isUnassigned ? '#FCD34D' : getUniqueColor(tasks.indexOf(taskData)),
                        }}
                        className={`
                          relative rounded cursor-pointer
                          ${taskData.isUnassigned ? 'text-black' : 'text-white'}
                          ${selectedTask === taskData.operationId ? 'ring-2 ring-yellow-400' : ''}
                          ${taskData.isMultiDay ? 'border-2 border-blue-300' : ''}
                          hover:brightness-90 transition-all duration-200
                        `}
                      >
                        <div className="absolute inset-0 px-1 flex items-center overflow-hidden">
                          {renderGanttTaskContent({
                            task: taskData.task,
                            groupBy,
                            labelIndex
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {tasks.length === 0 && groupBy === 'Technicien' && !isUnassignedGroup && (
                    <div className="h-full w-full flex items-center justify-center text-gray-400 italic">
                      Aucune tâche assignée
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  // Configuration des onglets et vues
  const getDragMessage = (): React.ReactNode => {
  if (!draggedTask) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 px-4 py-2 rounded-lg shadow-lg text-sm italic space-y-1">
      {draggedTask.startDate && draggedTask.endDate ? (
        draggedTask.task[2] !== selectedDate ? (
          <div className="text-red-600">
            Impossible de déplacer une tâche en dehors de sa période
          </div>
        ) : (
          <div>
            Glissez la tâche sur une ligne pour réaffecter au technicien correspondant
          </div>
        )
      ) : (
        <div>
          Glissez la tâche sur une ligne pour l&apos;affecter à la date sélectionnée
        </div>
      )}
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
                : `Détails des opérations pour le ${selectedDate}`}
            </h3>
            {renderTable(filterDataForDate(selectedDate, selectedTask))}
          </div>
        )}
      </div>
    </div>
  );

  const renderTable = (dataToRender: string[][]): React.ReactNode => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header, index) => {
              if (!getVisibleColumns().includes(index)) return null;
              
              return (
                <th
                  key={header}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {header}
                  {isFiltering && (
                    <input
                      type="text"
                      value={filters[header] || ''}
                      onChange={(e) => handleFilterChange(header, e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm 
                               focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      placeholder={`Filtrer ${header}`}
                    />
                  )}
                </th>
              );
            })}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {dataToRender.map((row, rowIndex) => {
            const operationId = getOperationId(row);
            const isEditing = editingRow === operationId;
            
            return (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {row.map((cell, cellIndex) => {
                  if (!getVisibleColumns().includes(cellIndex)) return null;
                  
                  return (
                    <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {renderCell(row, cell, headers[cellIndex], cellIndex)}
                    </td>
                  );
                })}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {isEditing ? (
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleSaveEdit(operationId)}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="text-red-600 hover:text-red-900"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEditClick(row)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    }
  ];

  // Rendu principal du composant
  return (
    <div className="container mx-auto p-4 min-h-screen bg-gray-50">
      <div className="mb-6 space-y-4">
        {/* Section upload de fichier et création */}
        <div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm">
          <input 
            type="file" 
            onChange={handleFileUpload} 
            accept=".csv" 
            className="flex-1"
          />
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 
                     transition-colors duration-200 flex items-center gap-2"
          >
            <Edit2 className="h-4 w-4" />
            Nouvelle opération
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 
                     transition-colors duration-200 flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            Exporter CSV
          </button>
        </div>

        {/* Onglets */}
        <div className="flex flex-wrap gap-2">
          {tabContent.map(({ title }, index) => (
            <button
              key={title}
              onClick={() => setActiveTab(index)}
              className={`
                px-4 py-2 rounded-lg transition-all duration-200
                ${activeTab === index 
                  ? 'bg-blue-500 text-white shadow-md scale-105' 
                  : 'bg-white hover:bg-gray-100'
                }
              `}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu principal */}
      <Card>
        <CardContent>
          {tabContent[activeTab].content}
        </CardContent>
      </Card>

      {/* Modal de création */}
      {renderCreateModal()}

      {/* Message drag and drop */}
      {draggedTask && getDragMessage()}
    </div>
  );
};

export default React.memo(CSVViewer);
