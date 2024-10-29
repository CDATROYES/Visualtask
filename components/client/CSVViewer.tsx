'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { parse, unparse } from 'papaparse';
import { Edit2, Save, X, Settings } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

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
  hasDefinedHours: boolean;
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
  hasDefinedHours?: boolean;
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

interface TabItem {
  title: string;
  content: React.ReactNode;
}

// Constantes
const GANTT_CONSTANTS = {
  BASE_ROW_HEIGHT: 60,
  HEADER_HEIGHT: 40,
  TASK_HEIGHT: 20,
  TASK_MARGIN: 4,
  DEFAULT_START_HOUR: 8,
  DEFAULT_DURATION: 1,
  DEFAULT_START_PERCENTAGE: 33.33, // 8:00 en pourcentage
  DEFAULT_DURATION_PERCENTAGE: 4.17, // 1 heure en pourcentage
} as const;

// Types pour les index des colonnes
const enum ColumnIndex {
  Vehicule = 0,
  Operation = 1,
  StartDate = 2,
  StartTime = 3,
  EndDate = 4,
  EndTime = 5,
  Location = 10,
  Technician = 15
}

// Types pour les vues
const enum ViewType {
  Table = 'Tableau',
  Vehicle = 'Véhicule',
  Location = 'Lieu',
  Technician = 'Technicien',
  Settings = 'Paramètres'
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

  // Configuration des colonnes visibles par défaut
  const DEFAULT_VISIBLE_COLUMNS = [
    ColumnIndex.Vehicule,
    ColumnIndex.Operation,
    ColumnIndex.StartDate,
    ColumnIndex.StartTime,
    ColumnIndex.EndDate,
    ColumnIndex.EndTime,
    ColumnIndex.Location,
    ColumnIndex.Location + 1, // Index 11
    ColumnIndex.Technician,
    ColumnIndex.Technician + 1, // Index 16
  ];

  // Effets
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
        visible: DEFAULT_VISIBLE_COLUMNS.includes(index),
        name: header
      }));
      setColumnVisibility(initialVisibility);
    }
  }, [headers]);

  // Configuration des onglets
  const tabs: TabItem[] = [
    { 
      title: ViewType.Table, 
      content: null // Sera défini plus tard avec renderTable
    },
    {
      title: ViewType.Vehicle,
      content: null // Sera défini plus tard avec renderGanttView
    },
    {
      title: ViewType.Location,
      content: null // Sera défini plus tard avec renderGanttView
    },
    {
      title: ViewType.Technician,
      content: null // Sera défini plus tard avec renderGanttView
    },
    {
      title: ViewType.Settings,
      content: null // Sera défini plus tard avec renderSettings
    }
  ];

  // Fonctions utilitaires de manipulation d'état
  const updateData = useCallback((updater: (prevData: string[][]) => string[][]) => {
    setData(prevData => {
      const newData = updater(prevData);
      return newData;
    });
  }, []);

  const resetEditing = useCallback(() => {
    setEditingRow(null);
    setEditedData({});
  }, []);

  const resetDragDrop = useCallback(() => {
    setDraggedTask(null);
    setDropZoneActive(null);
  }, []);

  const updateColumnVisibility = useCallback((columnIndex: number) => {
    setColumnVisibility(prev => 
      prev.map(col => 
        col.index === columnIndex 
          ? { ...col, visible: !col.visible }
          : col
      )
    );
  }, []);

  const resetColumnVisibility = useCallback(() => {
    setColumnVisibility(prev => 
      prev.map((col, index) => ({
        ...col,
        visible: DEFAULT_VISIBLE_COLUMNS.includes(index)
      }))
    );
  }, []);

  const getVisibleColumns = useCallback(() => {
    return columnVisibility
      .filter(col => col.visible)
      .map(col => col.index);
  }, [columnVisibility]);
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

const getTimePercentage = (time: string): number => {
  if (!time) return GANTT_CONSTANTS.DEFAULT_START_PERCENTAGE;
  try {
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return GANTT_CONSTANTS.DEFAULT_START_PERCENTAGE;
    return ((hours * 60 + minutes) / (24 * 60)) * 100;
  } catch (err) {
    console.error('Erreur lors du calcul du pourcentage de temps:', err);
    return GANTT_CONSTANTS.DEFAULT_START_PERCENTAGE;
  }
};

const hasDefinedHours = (task: string[]): boolean => {
  return Boolean(task[ColumnIndex.StartTime] && task[ColumnIndex.EndTime]);
};

// Fonction pour assigner une date à une tâche
const assignDateToTask = (task: string[], targetDate: string): string[] => {
  const updatedTask = [...task];
  updatedTask[ColumnIndex.StartDate] = targetDate;
  updatedTask[ColumnIndex.EndDate] = targetDate;

  // Conserver les heures existantes si elles sont présentes
  if (!updatedTask[ColumnIndex.StartTime] || !updatedTask[ColumnIndex.EndTime]) {
    updatedTask[ColumnIndex.StartTime] = `${GANTT_CONSTANTS.DEFAULT_START_HOUR.toString().padStart(2, '0')}:00`;
    updatedTask[ColumnIndex.EndTime] = `${(GANTT_CONSTANTS.DEFAULT_START_HOUR + GANTT_CONSTANTS.DEFAULT_DURATION)
      .toString().padStart(2, '0')}:00`;
  }

  return updatedTask;
};

// Gestionnaires d'événements de base
const handleDateSelection = (e: React.ChangeEvent<HTMLSelectElement>): void => {
  setSelectedDate(e.target.value);
  setSelectedTask(null); // Réinitialiser la tâche sélectionnée lors du changement de date
};

const handleTaskClick = (operationId: string) => {
  setSelectedTask(prevTask => prevTask === operationId ? null : operationId);
};

const handleTechnicianInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
  setNewTechnician(e.target.value);
};

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

const handleFilterChange = (header: string, value: string): void => {
  setFilters(prev => ({
    ...prev,
    [header]: value
  }));
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

// Filtrage des données
const filteredData = useCallback(() => {
  return data.filter(row => {
    return headers.every((header, index) => {
      const filterValue = (filters[header] || '').toLowerCase();
      const cellValue = (row[index] || '').toString().toLowerCase();
      return !filterValue || cellValue.includes(filterValue);
    });
  });
}, [data, headers, filters]);
// Gestion des fichiers et données
const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
  const file = event.target.files?.[0];
  if (!file) return;

  parse(file, {
    complete: (results: CSVResult) => {
      const processedData = results.data.slice(1)
        .filter((row: string[]) => row.some(cell => cell))
        .map((row: string[]) => {
          const updatedRow = [...row];
          updatedRow[ColumnIndex.Technician] = updatedRow[ColumnIndex.Technician]?.trim() || "Sans technicien";

          // Formatage des dates
          if (updatedRow[ColumnIndex.StartDate] && updatedRow[ColumnIndex.EndDate]) {
            const startDate = new Date(updatedRow[ColumnIndex.StartDate]);
            const endDate = new Date(updatedRow[ColumnIndex.EndDate]);
            updatedRow[ColumnIndex.StartDate] = startDate.toISOString().split('T')[0];
            updatedRow[ColumnIndex.EndDate] = endDate.toISOString().split('T')[0];
          }
          return updatedRow;
        });

      setData(processedData);
      setHeaders(results.data[0]);

      // Extraction des dates et techniciens uniques
      const { dates, technicians } = extractUniqueData(processedData);
      setUniqueDates(dates);
      setAllTechnicians(technicians);

      // Initialisation des filtres
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

const extractUniqueData = (processedData: string[][]) => {
  const allDatesSet = new Set<string>();
  const technicianSet = new Set<string>();

  processedData.forEach((row: string[]) => {
    if (row[ColumnIndex.StartDate] && row[ColumnIndex.EndDate]) {
      const startDate = new Date(row[ColumnIndex.StartDate]);
      const endDate = new Date(row[ColumnIndex.EndDate]);

      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        allDatesSet.add(date.toISOString().split('T')[0]);
      }
    }
    if (row[ColumnIndex.Technician]) {
      technicianSet.add(row[ColumnIndex.Technician].trim());
    }
  });

  // Tri des dates et techniciens
  const dates = Array.from(allDatesSet)
    .filter(date => date)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const technicians = Array.from(technicianSet)
    .filter(tech => tech && tech !== "Sans technicien")
    .sort((a, b) => a.localeCompare(b));

  if (technicianSet.has("Sans technicien")) {
    technicians.push("Sans technicien");
  }

  return { dates, technicians };
};

const filterDataForDate = useCallback((dateStr: string, operationId: string | null = null): string[][] => {
  if (!dateStr || !data.length) return [];

  try {
    const dateObj = new Date(dateStr);
    dateObj.setHours(0, 0, 0, 0);

    // Filtrage initial des données
    let filteredByDate = data.filter((row: string[]) => {
      // Inclusion des tâches non affectées
      if (!row[ColumnIndex.StartDate] || !row[ColumnIndex.EndDate]) {
        return operationId ? getOperationId(row) === operationId : true;
      }

      try {
        const startDate = new Date(row[ColumnIndex.StartDate]);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(row[ColumnIndex.EndDate]);
        endDate.setHours(23, 59, 59, 999);
        return startDate <= dateObj && dateObj <= endDate;
      } catch (err) {
        console.error('Erreur lors du filtrage des dates:', err);
        return false;
      }
    });

    // Ajustement des heures pour les tâches multi-jours
    filteredByDate = filteredByDate.map(row => {
      const adjustedRow = [...row];
      
      if (!row[ColumnIndex.StartDate] || !row[ColumnIndex.EndDate]) {
        return adjustedRow;
      }

      const startDate = new Date(adjustedRow[ColumnIndex.StartDate]);
      const endDate = new Date(adjustedRow[ColumnIndex.EndDate]);
      const currentDate = new Date(dateStr);

      if (startDate < currentDate && !isSameDay(startDate.toISOString(), currentDate.toISOString())) {
        adjustedRow[ColumnIndex.StartTime] = '00:00';
      }
      if (endDate > currentDate && !isSameDay(endDate.toISOString(), currentDate.toISOString())) {
        adjustedRow[ColumnIndex.EndTime] = '23:59';
      }

      return adjustedRow;
    });

    // Filtrage par operationId si spécifié
    if (operationId) {
      return filteredByDate.filter(row => getOperationId(row) === operationId);
    }

    return filteredByDate;
  } catch (err) {
    console.error('Erreur lors du filtrage des données:', err);
    return [];
  }
}, [data, isSameDay]);

const handleExportCSV = (): void => {
  const dataToExport = isFiltering ? filteredData() : data;
  const csv = unparse({
    fields: headers,
    data: dataToExport
  });
  const fileName = `export_${new Date().toISOString().split('T')[0]}.csv`;
  
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

const groupDataByType = useCallback((groupBy: ViewType, filteredDataForDate: string[][]): GroupData => {
  let groupIndex: number;
  let labelIndex: number;
  let groups: string[] = [];
  
  // Séparer les tâches non affectées
  const unassignedTasks = data.filter(row => !row[ColumnIndex.StartDate] || !row[ColumnIndex.EndDate]);

  switch (groupBy) {
    case ViewType.Vehicle:
      groupIndex = ColumnIndex.Vehicule;
      labelIndex = ColumnIndex.Operation;
      groups = Array.from(new Set(filteredDataForDate.map(row => row[groupIndex])))
        .filter(Boolean)
        .sort();
      break;
    case ViewType.Location:
      groupIndex = ColumnIndex.Location;
      labelIndex = ColumnIndex.Operation;
      groups = Array.from(new Set(filteredDataForDate.map(row => row[groupIndex])))
        .filter(Boolean)
        .sort();
      break;
    case ViewType.Technician:
      groupIndex = ColumnIndex.Technician;
      labelIndex = ColumnIndex.Technician;
      groups = allTechnicians;
      break;
    default:
      return { groups: [], groupIndex: 0, labelIndex: 0, unassignedTasks: [] };
  }

  // Ajouter le groupe "Non affectées" s'il y a des tâches non affectées
  if (unassignedTasks.length > 0) {
    groups.push("Non affectées");
  }

  return { groups, groupIndex, labelIndex, unassignedTasks };
}, [allTechnicians, data]);
// Gestion de l'édition
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
  resetEditing();
};

const handleSaveEdit = (operationId: string): void => {
  const updatedRow = headers.map(header => editedData[header] || '');
  updateData(prevData => 
    prevData.map(row => getOperationId(row) === operationId ? updatedRow : row)
  );
  resetEditing();
};

const handleInputChange = (header: string, value: string): void => {
  setEditedData(prev => ({
    ...prev,
    [header]: value
  }));
};

// Gestion du drag & drop
const handleDragStart = (e: React.DragEvent<HTMLDivElement>, task: TaskData): void => {
  e.stopPropagation();
  const taskData: DraggedTaskData = {
    ...task,
    date: selectedDate,
    operationId: getOperationId(task.task),
    startDate: task.task[ColumnIndex.StartDate] || null,
    endDate: task.task[ColumnIndex.EndDate] || null,
    originalTechnician: task.task[ColumnIndex.Technician],
    startPercentage: task.startPercentage,
    duration: task.duration,
    hasDefinedHours: hasDefinedHours(task.task)
  };

  setDraggedTask(taskData);

  // Création de l'élément fantôme pour le drag
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

const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>, targetGroup: string): void => {
  e.preventDefault();
  e.stopPropagation();
  setDropZoneActive(targetGroup);
}, []);

const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>, targetGroup: string): void => {
  e.preventDefault();
  e.stopPropagation();
  if (dropZoneActive === targetGroup) {
    setDropZoneActive(null);
  }
}, [dropZoneActive]);

const handleDragEnd = useCallback((): void => {
  resetDragDrop();
}, [resetDragDrop]);

const updateAssignment = useCallback((operationId: string, newTechnician: string): void => {
  updateData(prevData => 
    prevData.map(row => {
      if (getOperationId(row) === operationId) {
        const newRow = [...row];
        newRow[ColumnIndex.Technician] = newTechnician;
        return newRow;
      }
      return row;
    })
  );
}, [updateData]);

const handleDrop = useCallback((targetGroup: string, e: React.DragEvent<HTMLDivElement>): void => {
  e.preventDefault();
  e.stopPropagation();

  if (!draggedTask || !draggedTask.operationId) {
    setDropZoneActive(null);
    return;
  }

  const { operationId, task: draggedTaskData, startDate, endDate, originalTechnician } = draggedTask;
  const isUnassignedTask = !startDate || !endDate;

  if (isUnassignedTask) {
    const updatedTask = assignDateToTask(draggedTaskData, selectedDate);
    
    if (targetGroup !== "Non affectées") {
      updatedTask[ColumnIndex.Technician] = targetGroup;
    }

    updateData(prevData => 
      prevData.map(row => 
        getOperationId(row) === operationId ? updatedTask : row
      )
    );
  } else {
    const selectedDateObj = new Date(selectedDate);
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (selectedDateObj < startDateObj || selectedDateObj > endDateObj) {
      console.log("Impossible de déplacer une tâche en dehors de sa période");
      resetDragDrop();
      return;
    }

    if (originalTechnician === targetGroup) {
      setDropZoneActive(null);
      return;
    }

    updateAssignment(operationId, targetGroup);
  }

  resetDragDrop();
}, [draggedTask, selectedDate, updateAssignment, resetDragDrop]);

// Messages de drag & drop
const getDragMessage = useCallback((): React.ReactNode => {
  if (!draggedTask) return null;

  const isUnassigned = !draggedTask.startDate || !draggedTask.endDate;
  const message = isUnassigned
    ? `Glissez la tâche sur une ligne pour l'affecter à la date sélectionnée ${
        draggedTask.hasDefinedHours ? '(les heures seront conservées)' : ''
      }`
    : draggedTask.task[ColumnIndex.StartDate] !== selectedDate
    ? `Impossible de déplacer une tâche en dehors de sa période (${draggedTask.task[ColumnIndex.StartDate]})`
    : "Glissez la tâche sur une ligne pour réaffecter au technicien correspondant";

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 px-4 py-2 rounded-lg shadow-lg">
      {isUnassigned && !draggedTask.hasDefinedHours ? (
        <span className="text-yellow-600">{message}</span>
      ) : draggedTask.task[ColumnIndex.StartDate] !== selectedDate ? (
        <span className="text-red-600">{message}</span>
      ) : (
        message
      )}
    </div>
  );
}, [draggedTask, selectedDate]);
// Composants de rendu principaux
const renderTable = (dataToRender: string[][]): React.ReactNode => {
  const visibleColumns = getVisibleColumns();
  
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold">Vue Tableau</h2>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 
                   transition-colors duration-200 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exporter en CSV
        </button>
      </div>

      <div className="w-full overflow-y-auto">
        <table className="min-w-full border border-gray-300" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {renderTableHeader()}
          </thead>
          <tbody className="bg-white">
            {dataToRender.map((row, rowIndex) => {
              const operationId = getOperationId(row);
              const isEditing = editingRow === operationId;
              const isUnassigned = !row[ColumnIndex.StartDate] || !row[ColumnIndex.EndDate];
              const hasHours = hasDefinedHours(row);

              return (
                <tr
                  key={operationId}
                  className={`
                    ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-100'}
                    ${isEditing ? 'bg-yellow-50' : ''}
                    ${isUnassigned ? hasHours ? 'bg-blue-50' : 'bg-yellow-50' : ''}
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
                    {renderActionButtons(row, isEditing)}
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

const renderGanttTaskContent = ({ task, groupBy, labelIndex }: Omit<RenderProps, 'HEADER_HEIGHT'>): React.ReactNode => {
  if (!task) return null;
  
  const isUnassigned = !task[ColumnIndex.StartDate] || !task[ColumnIndex.EndDate];
  const hasHours = hasDefinedHours(task);
  
  const content = (
    <div className="flex items-center gap-1 w-full overflow-hidden">
      <span className="truncate">
        {`${task[ColumnIndex.Vehicule] || 'N/A'} - ${task[ColumnIndex.Operation] || 'N/A'}`}
      </span>
      {isUnassigned && (
        <span className={`flex-shrink-0 text-xs px-1 rounded ${
          hasHours ? 'bg-blue-200 text-blue-800' : 'bg-yellow-200 text-yellow-800'
        }`}>
          {hasHours ? 'Non planifiée (heures définies)' : 'Non planifiée'}
        </span>
      )}
      {!isUnassigned && task[ColumnIndex.StartDate] && task[ColumnIndex.EndDate] && 
       !isSameDay(task[ColumnIndex.StartDate], task[ColumnIndex.EndDate]) && (
        <span className="flex-shrink-0 text-xs bg-blue-200 text-blue-800 px-1 rounded">
          Multi-jours
        </span>
      )}
    </div>
  );

  return content;
};

const renderTableHeader = (): React.ReactNode => {
  const visibleColumns = getVisibleColumns();
  
  return (
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
  );
};

const renderActionButtons = (row: string[], isEditing: boolean): React.ReactNode => (
  <div className="flex justify-center gap-2">
    {isEditing ? (
      <>
        <button
          onClick={() => handleSaveEdit(getOperationId(row))}
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

const renderDateSelector = (): React.ReactNode => (
  <select 
    value={selectedDate} 
    onChange={handleDateSelection}
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
      onChange={handleTechnicianInput}
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
// Composant Gantt et rendu final
const renderGanttChart = (groupBy: ViewType): React.ReactNode => {
  if (!selectedDate) {
    return <p>Veuillez sélectionner une date</p>;
  }

  const {
    BASE_ROW_HEIGHT,
    HEADER_HEIGHT,
    TASK_HEIGHT,
    TASK_MARGIN
  } = GANTT_CONSTANTS;

  const MIN_ROW_HEIGHT = BASE_ROW_HEIGHT;
  const filteredDataForDate = filterDataForDate(selectedDate);
  const { groups = [], groupIndex = 0, labelIndex = 0, unassignedTasks = [] } = groupDataByType(groupBy, filteredDataForDate);

  if (!groups.length && !unassignedTasks.length) {
    return <p>Aucune donnée à afficher pour cette date</p>;
  }

  const groupedData: GanttChartData[] = groups.map(group => {
    const tasks = group === "Non affectées"
      ? unassignedTasks.map(task => {
          const taskHasDefinedHours = hasDefinedHours(task);
          return {
            task,
            startPercentage: taskHasDefinedHours ? getTimePercentage(task[ColumnIndex.StartTime]) : GANTT_CONSTANTS.DEFAULT_START_PERCENTAGE,
            duration: taskHasDefinedHours 
              ? Math.max(0.5, getTimePercentage(task[ColumnIndex.EndTime]) - getTimePercentage(task[ColumnIndex.StartTime])) 
              : GANTT_CONSTANTS.DEFAULT_DURATION_PERCENTAGE,
            operationId: getOperationId(task),
            isMultiDay: false,
            isStart: true,
            isEnd: true,
            isUnassigned: true,
            hasDefinedHours: taskHasDefinedHours
          };
        })
      : filteredDataForDate
          .filter(row => row && row[groupIndex] === group)
          .map(task => {
            const hasStartAndEnd = Boolean(task[ColumnIndex.StartDate] && task[ColumnIndex.EndDate]);
            const isMultiDay = hasStartAndEnd ? !isSameDay(task[ColumnIndex.StartDate], task[ColumnIndex.EndDate]) : false;
            const isStart = hasStartAndEnd ? isSameDay(task[ColumnIndex.StartDate], selectedDate) : false;
            const isEnd = hasStartAndEnd ? isSameDay(task[ColumnIndex.EndDate], selectedDate) : false;

            return {
              task,
              startPercentage: getTimePercentage(task[ColumnIndex.StartTime]),
              duration: Math.max(0.5, getTimePercentage(task[ColumnIndex.EndTime]) - getTimePercentage(task[ColumnIndex.StartTime])),
              operationId: getOperationId(task),
              isMultiDay,
              isStart,
              isEnd,
              isUnassigned: false,
              hasDefinedHours: hasDefinedHours(task)
            };
          });

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
    <div className="overflow-x-auto w-full">
      <div className="flex min-w-[1000px]">
        {/* Colonne des groupes */}
        <div className="sticky left-0 z-10 w-[200px]" style={{ borderRight: '2px solid #333', backgroundColor: '#f0f0f0' }}>
          <div className="flex items-center font-bold px-2.5" style={{ height: `${HEADER_HEIGHT}px`, borderBottom: '2px solid #333' }}>
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
        <div className="flex-1 relative">
          {renderTimeHeader({ HEADER_HEIGHT })}
          {groupedData.map(({ group, tasks, overlaps, rowHeight, isUnassignedGroup }, index) => (
            <div 
              key={group}
              style={{ height: `${rowHeight}px` }}
              className={`
                relative border-b border-gray-200 transition-colors
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
                      backgroundColor: taskData.isUnassigned 
                        ? (taskData.hasDefinedHours ? '#93C5FD' : '#FCD34D')
                        : getUniqueColor(tasks.indexOf(taskData)),
                      borderLeft: !taskData.isStart ? '4px solid rgba(0,0,0,0.3)' : undefined,
                      borderRight: !taskData.isEnd ? '4px solid rgba(0,0,0,0.3)' : undefined,
                      outline: selectedTask === taskData.operationId ? '2px solid yellow' : undefined,
                      boxShadow: selectedTask === taskData.operationId ? '0 0 0 2px yellow' : undefined,
                    }}
                    className="rounded px-1 text-xs overflow-hidden whitespace-nowrap select-none cursor-grab
                              hover:brightness-90 transition-all duration-200"
                  >
                    {renderGanttTaskContent({
                      task: taskData.task,
                      groupBy,
                      labelIndex
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const renderGanttView = (groupBy: ViewType, showTechnicianInput: boolean = false) => (
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
        <p>Les tâches non planifiées avec heures définies sont en bleu clair.</p>
        <p>Les tâches non planifiées sans heures définies sont en jaune.</p>
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

// Configuration des onglets et rendu principal
const tabContent = [
  { 
    title: ViewType.Table, 
    content: renderTable(filteredData()) 
  },
  {
    title: ViewType.Vehicle,
    content: renderGanttView(ViewType.Vehicle)
  },
  {
    title: ViewType.Location,
    content: renderGanttView(ViewType.Location)
  },
  {
    title: ViewType.Technician,
    content: renderGanttView(ViewType.Technician, true)
  },
  {
    title: ViewType.Settings,
    content: renderSettings()
  }
];

// Rendu principal du composant
return (
  <div className="container mx-auto p-4 min-h-screen bg-gray-50">
    <div className="mb-6 space-y-4">
      <div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm">
        <input 
          type="file" 
          onChange={handleFileUpload} 
          accept=".csv" 
          className="flex-1"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {tabContent.map((tab, index) => (
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
            {tab.title === ViewType.Settings && <Settings className="h-4 w-4" />}
            {tab.title}
          </button>
        ))}
      </div>
    </div>

    <Card>
      <CardContent>
        {tabContent[activeTab].content}
      </CardContent>
    </Card>
  </div>
);
};

// Export avec mémorisation pour les performances
export default React.memo(CSVViewer);
