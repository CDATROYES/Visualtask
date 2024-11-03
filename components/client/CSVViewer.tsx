'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { parse, unparse } from 'papaparse';
import { Edit2, Save, X, Settings } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// Principal interfaces
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
  // State declarations
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

  // Basic utility functions
  const formatDate = useCallback((dateStr: string): string => {
    const date = new Date(dateStr);
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    
    return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
  }, []);

  const isSameDay = useCallback((date1: string, date2: string): boolean => {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }, []);

  const getOperationId = useCallback((task: string[]): string => {
    return `${task[0]}_${task[1]}_${task[2] || 'unassigned'}_${task[4] || 'unassigned'}`;
  }, []);

  const getUniqueColor = useCallback((index: number): string => {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }, []);

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
  
//############################################################################################### suite dans la partie 2 ######################################################################################################

// Time management functions
  const getTimePercentage = useCallback((time: string): number => {
    if (!time) return 33.33; // Default to 8:00
    try {
      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) return 33.33;
      return ((hours * 60 + minutes) / (24 * 60)) * 100;
    } catch (err) {
      console.error('Error calculating time percentage:', err);
      return 33.33;
    }
  }, []);

  const calculateDuration = useCallback((startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 4.17; // Default ~1 hour

    try {
      const startPercentage = getTimePercentage(startTime);
      const endPercentage = getTimePercentage(endTime);
      return endPercentage - startPercentage;
    } catch (err) {
      console.error('Error calculating duration:', err);
      return 4.17;
    }
  }, [getTimePercentage]);

  // Data filtering - Placing this early as it's used by other functions
  const filteredData = useMemo(() => 
    data.filter(row => 
      headers.every((header, index) => {
        const filterValue = (filters[header] || '').toLowerCase();
        const cellValue = (row[index] || '').toString().toLowerCase();
        return !filterValue || cellValue.includes(filterValue);
      })
    )
  , [data, headers, filters]);

  // Base handlers
  const handleInputChange = useCallback((header: string, value: string): void => {
    setEditedData(prev => ({
      ...prev,
      [header]: value
    }));
  }, []);

  const handleFilterChange = useCallback((header: string, value: string): void => {
    setFilters(prev => ({
      ...prev,
      [header]: value
    }));
  }, []);

  const handleColumnVisibilityChange = useCallback((columnIndex: number): void => {
    setColumnVisibility(prev => 
      prev.map(col => 
        col.index === columnIndex 
          ? { ...col, visible: !col.visible }
          : col
      )
    );
  }, []);

  const resetColumnVisibility = useCallback((): void => {
    setColumnVisibility(prev => 
      prev.map((col, index) => ({
        ...col,
        visible: [0,1,2,3,4,5,10,11,15,16].includes(index)
      }))
    );
  }, []);

  const getVisibleColumns = useCallback((): number[] => {
    return columnVisibility
      .filter(col => col.visible)
      .map(col => col.index);
  }, [columnVisibility]);

  // Edit handlers
  const handleEditClick = useCallback((row: string[]): void => {
    const operationId = getOperationId(row);
    setEditingRow(operationId);
    const rowData: Record<string, string> = {};
    headers.forEach((header, index) => {
      rowData[header] = row[index] || '';
    });
    setEditedData(rowData);
  }, [headers, getOperationId]);

  const handleCancelEdit = useCallback((): void => {
    setEditingRow(null);
    setEditedData({});
  }, []);

  const handleSaveEdit = useCallback((operationId: string): void => {
    setData(prevData => 
      prevData.map(row => getOperationId(row) === operationId 
        ? headers.map(header => editedData[header] || '')
        : row
      )
    );
    setEditingRow(null);
    setEditedData({});
  }, [headers, editedData, getOperationId]);

  // Export handlers - Now can safely use filteredData
  const handleExportCSV = useCallback((): void => {
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
  }, [data, headers, isFiltering, filteredData, selectedDate]);

  // Task handlers
  const handleTaskClick = useCallback((operationId: string): void => {
    setSelectedTask(prevTask => prevTask === operationId ? null : operationId);
  }, []);

  // Technician handlers
  const handleAddTechnician = useCallback((): void => {
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
  }, [newTechnician]);

  // Percentage calculations
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
  }, [getTimePercentage, isSameDay]);

//############################################################################################### suite dans la partie 3 ######################################################################################################

// Task assignment functions
  const assignDateToTask = useCallback((task: string[], targetDate: string): string[] => {
    const updatedTask = [...task];
    updatedTask[2] = targetDate;    
    
    const hasTime = Boolean(task[3] && task[5]);
    if (hasTime) {
      updatedTask[3] = task[3];    // Keep existing start time
      updatedTask[4] = targetDate;  // New end date
      updatedTask[5] = task[5];    // Keep existing end time
    } else {
      updatedTask[3] = '08:00';    // Default start time
      updatedTask[4] = targetDate;  // End date
      updatedTask[5] = '09:00';    // Default end time
    }
    
    return updatedTask;
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
  }, [getOperationId]);

  // Drag and Drop handlers
  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, task: TaskData): void => {
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
  }, [selectedDate, getOperationId, getTimePercentage, calculateDuration]);

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
        console.log("Cannot move task outside its period");
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
  }, [draggedTask, selectedDate, assignDateToTask, updateAssignment, getOperationId]);

  // Percentage calculations
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
  }, [getTimePercentage, isSameDay]);

  // Overlap detection
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
  }, [getOperationId]);

//############################################################################################### suite dans la partie 4 ######################################################################################################

// Data filtering functions
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
          console.error('Error filtering dates:', err);
          return false;
        }
      });

      return filteredByDate;
    } catch (err) {
      console.error('Error filtering data:', err);
      return [];
    }
  }, [data, getOperationId]);

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
  }, [allTechnicians, data, getOperationId]);

  // Basic render components
  const renderCell = useCallback((row: string[], cell: string, header: string, index: number): React.ReactNode => {
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
      if (header === headers[15]) { // Technician field
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
  }, [editingRow, editedData, headers, allTechnicians, handleInputChange, getOperationId]);

  const renderTimeHeader = useCallback(({ HEADER_HEIGHT }: Pick<RenderProps, 'HEADER_HEIGHT'>): React.ReactNode => (
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
  ), []);

  const renderGanttTaskContent = useCallback(({ task, groupBy, labelIndex }: Omit<RenderProps, 'HEADER_HEIGHT'>): React.ReactNode => {
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
  }, [isSameDay]);

//############################################################################################### suite dans la partie 5 ######################################################################################################

// UI Components
  const renderDateSelector = useCallback((): React.ReactNode => (
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
  ), [selectedDate, uniqueDates, formatDate]);

  const renderTechnicianInput = useCallback((): React.ReactNode => (
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
  ), [newTechnician, handleAddTechnician]);

  const renderSettings = useCallback((): React.ReactNode => (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Paramètres d'affichage</h2>
          <button
            onClick={resetColumnVisibility}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Réinitialiser
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {columnVisibility.map((col) => (
            <div key={col.index} className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`col-${col.index}`}
                checked={col.visible}
                onChange={() => handleColumnVisibilityChange(col.index)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor={`col-${col.index}`} className="text-sm">
                {col.name}
              </label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  ), [columnVisibility, resetColumnVisibility, handleColumnVisibilityChange]);

  const renderFilterReset = useCallback((): React.ReactNode => {
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
  }, [selectedTask]);

  const getDragMessage = useCallback((): React.ReactNode => {
    if (!draggedTask) return null;

    const isUnassigned = !draggedTask.startDate || !draggedTask.endDate;

    return (
      <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 px-4 py-2 rounded-lg shadow-lg">
        {isUnassigned ? (
          "Glissez la tâche sur une ligne pour l'affecter à la date sélectionnée"
        ) : draggedTask.task[2] !== selectedDate ? (
          <span className="text-red-600">
            Impossible de déplacer une tâche en dehors de sa période ({formatDate(draggedTask.task[2])})
          </span>
        ) : (
          "Glissez la tâche sur une ligne pour réaffecter au technicien correspondant"
        )}
      </div>
    );
  }, [draggedTask, selectedDate, formatDate]);

  const renderTabButtons = useCallback((): React.ReactNode => (
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
  ), [activeTab]);

  // Important: Déclarer renderTable avant renderGanttView car il est utilisé dedans
  const renderTable = useCallback((dataToRender: string[][]): React.ReactNode => {
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

        <div className="w-full overflow-x-auto">
          <table className="min-w-full border border-gray-300">
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
            <tbody>
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
  }, [
    headers, 
    isFiltering, 
    filters, 
    editingRow,
    handleFilterChange,
    handleSaveEdit,
    handleCancelEdit,
    handleEditClick,
    renderCell,
    getVisibleColumns,
    handleExportCSV,
    getOperationId
  ]);

//############################################################################################### suite dans la partie 6 ######################################################################################################

// Gantt Chart render
  const renderGanttChart = useCallback((groupBy: string): React.ReactNode => {
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
      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className="sticky top-0 z-10 flex">
            <div className="w-48 bg-gray-100 border-r border-gray-300">
              <div className="h-10 flex items-center px-4 font-semibold border-b border-gray-300">
                {groupBy}
              </div>
            </div>
            <div className="flex-1">
              {renderTimeHeader({ HEADER_HEIGHT })}
            </div>
          </div>

          {groupedData.map(({ group, tasks, overlaps, rowHeight, isUnassignedGroup }, index) => (
            <div key={group} className="flex">
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
                        rounded cursor-pointer px-1
                        ${taskData.isUnassigned ? 'text-black' : 'text-white'}
                        ${selectedTask === taskData.operationId ? 'ring-2 ring-yellow-400' : ''}
                        ${taskData.isMultiDay ? 'border-2 border-blue-300' : ''}
                        hover:brightness-90 transition-all duration-200
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
            </div>
          ))}
        </div>
      </div>
    );
  }, [
    selectedDate,
    filterDataForDate,
    groupDataByType,
    getTimePercentage,
    calculateDuration,
    getOperationId,
    calculateDayPercentages,
    detectOverlaps,
    renderTimeHeader,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragStart,
    handleDragEnd,
    handleTaskClick,
    renderGanttTaskContent,
    dropZoneActive,
    selectedTask,
    isSameDay,
    getUniqueColor
  ]);

  const renderGanttView = useCallback((groupBy: string, showTechnicianInput: boolean = false) => (
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
  ), [
    renderDateSelector,
    renderTechnicianInput,
    renderGanttChart,
    getDragMessage,
    renderFilterReset,
    renderTable,
    draggedTask,
    selectedDate,
    selectedTask,
    filterDataForDate,
    formatDate
  ]);

  // Tab configuration
  const tabContent = useMemo(() => [
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
  ], [filteredData, renderTable, renderGanttView, renderSettings]);

// ############################################################################################## suite dans la partie 7 ######################################################################################################

// File handling
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
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

        // Generate unique dates and technicians
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
        console.error('Error reading file:', error);
      }
    });
  }, []);

  // Final component render
  return (
    <div className="container mx-auto p-4 min-h-screen bg-gray-50">
      <div className="mb-6 space-y-4">
        {/* File upload section */}
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
            Exporter CSV
          </button>
        </div>

        {/* Tabs */}
        {renderTabButtons()}
      </div>

      {/* Main content */}
      <Card>
        <CardContent>
          {tabContent[activeTab].content}
        </CardContent>
      </Card>

      {/* Drag and drop message */}
      {draggedTask && getDragMessage()}
    </div>
  );
};

export default React.memo(CSVViewer);
