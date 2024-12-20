'use client';
export {};

import * as XLSX from 'xlsx';
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

const generateAllDatesInRange = (startDate: Date, endDate: Date): string[] => {
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  currentDate.setHours(12, 0, 0, 0);
  
  const endDateTime = new Date(endDate);
  endDateTime.setHours(12, 0, 0, 0);

  while (currentDate <= endDateTime) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

const findDateRange = (data: string[][]): { start: Date, end: Date } => {
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  data.forEach(row => {
    if (row[2]) {
      const startDate = new Date(row[2]);
      startDate.setHours(12, 0, 0, 0);
      if (!minDate || startDate < minDate) {
        minDate = startDate;
      }
    }
    if (row[4]) {
      const endDate = new Date(row[4]);
      endDate.setHours(12, 0, 0, 0);
      if (!maxDate || endDate > maxDate) {
        maxDate = endDate;
      }
    }
  });

  // Si aucune date n'est trouvée, utiliser une période par défaut
  if (!minDate || !maxDate) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    minDate = new Date(today);
    maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 1);
  }

  // Étendre la plage de dates d'une semaine avant et après
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 7);

  return { start: minDate, end: maxDate };
};


// Fonction utilitaire pour corriger les dates
const correctDate = (date: Date): Date => {
  const correctedDate = new Date(date.getTime());
  correctedDate.setHours(12, 0, 0, 0); // On fixe l'heure à midi pour éviter les problèmes de fuseau horaire
  return correctedDate;
};

// Fonction de formatage des dates
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  date.setHours(12, 0, 0, 0);
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  
  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
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
    d1.setHours(12, 0, 0, 0);
    const d2 = new Date(date2);
    d2.setHours(12, 0, 0, 0);
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

const generateDateRange = (start: Date, end: Date): string[] => {
  const dates: string[] = [];
  const current = new Date(start);
  current.setHours(12, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(12, 0, 0, 0);
  
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

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
// Modification du filterDataForDate pour éviter les doublons
const filterDataForDate = useCallback((dateStr: string, operationId: string | null = null): string[][] => {
  if (!dateStr || !data.length) return [];

  try {
    const dateObj = new Date(dateStr);
    dateObj.setUTCHours(0, 0, 0, 0);

    // Si on cherche une opération spécifique, on ne retourne que la première occurrence
    if (operationId) {
      const matchingRows = data.filter((row: string[]) => 
        getOperationId(row) === operationId
      );
      // Ne retourner que la première occurrence trouvée
      return matchingRows.slice(0, 1);
    }

    // Pour les autres cas, filtrer normalement par date
    return data.filter((row: string[]) => {
      if (!row[2] || !row[4]) return false;

      try {
        const startDate = new Date(row[2]);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(row[4]);
        endDate.setUTCHours(23, 59, 59, 999);
        return startDate <= dateObj && dateObj <= endDate;
      } catch (err) {
        console.error('Erreur lors du filtrage des dates:', err);
        return false;
      }
    });
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

// Fonction utilitaire pour convertir le format spécial de date
const convertSpecialDateFormat = (dateStr: string): string => {
  if (!dateStr) return '';
  
  // Si la date est dans le format +YYYYYY-MM-DD
  if (dateStr.match(/^\+\d{6}-\d{2}-\d{2}$/)) {
    try {
      // Enlever le '+' et convertir en format standard YYYY-MM-DD
      const year = parseInt(dateStr.substring(1, 7), 10);
      const month = dateStr.substring(8, 10);
      const day = dateStr.substring(11, 13);
      
      // Créer une date en format ISO standard
      return `${year}-${month}-${day}`;
    } catch (err) {
      console.error('Erreur lors de la conversion de la date:', err);
      return dateStr;
    }
  }
  
  return dateStr;
};

// Fonction pour convertir un nombre Excel en date
const convertExcelDate = (excelDate: number | string): string => {
  if (!excelDate) return '';
  
  try {
    // Convertir en nombre si c'est une chaîne
    const numericDate = typeof excelDate === 'string' ? parseInt(excelDate, 10) : excelDate;
    
    // Conversion du nombre Excel en date JavaScript
    // Excel utilise le 1er janvier 1900 comme date de référence
    // et compte le nombre de jours depuis cette date
    const dateObj = new Date((numericDate - 25569) * 86400 * 1000);
    dateObj.setHours(12, 0, 0, 0);
    
    // Format YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (err) {
    console.error('Erreur lors de la conversion de la date Excel:', err);
    return '';
  }
};

// Fonction pour convertir une heure décimale Excel en format HH:mm
const convertExcelTime = (excelTime: number | string): string => {
  if (!excelTime) return '';
  
  try {
    // Convertir en nombre si c'est une chaîne
    const numericTime = typeof excelTime === 'string' ? parseFloat(excelTime) : excelTime;
    
    // Convertir le temps décimal en heures et minutes
    const totalMinutes = Math.round(numericTime * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    // Format HH:mm
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } catch (err) {
    console.error('Erreur lors de la conversion de l\'heure Excel:', err);
    return '';
  }
};

const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  
  reader.onload = (e: ProgressEvent<FileReader>) => {
    try {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Conversion en tableau avec les valeurs brutes
      const excelData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
        header: 1,
        defval: '',
        raw: true
      });

      const headers = excelData[0] as string[];
      const processedData = excelData.slice(1)
        .filter((row: any[]) => row.some(cell => cell))
        .map((row: any[]) => {
          const normalizedRow = [...Array(headers.length)].map((_, index) => {
            const value = row[index];
            
            // Traitement des dates (colonnes 2 et 4 - index commençant à 0)
            if (index === 2 || index === 4) {
              return convertExcelDate(value);
            }
            
            // Traitement des heures (colonnes 3 et 5)
            if (index === 3 || index === 5) {
              return convertExcelTime(value);
            }
            
            // Autres colonnes
            return value?.toString() || '';
          });
          
          // Traitement spécial pour la colonne des techniciens
          normalizedRow[15] = normalizedRow[15]?.trim() || "Sans technicien";
          
          return normalizedRow;
        });

      setData(processedData);
      setHeaders(headers);

      // Trouver la plage de dates et générer toutes les dates
      const { start, end } = findDateRange(processedData);
      const allDates = generateAllDatesInRange(start, end);
      setUniqueDates(allDates);

      // Mise à jour des techniciens
      const technicianSet = new Set<string>();
      processedData.forEach((row: string[]) => {
        if (row[15]) {
          technicianSet.add(row[15].trim());
        }
      });

      const sortedTechnicians = Array.from(technicianSet)
        .filter(tech => tech && tech !== "Sans technicien")
        .sort((a, b) => a.localeCompare(b));

      if (technicianSet.has("Sans technicien")) {
        sortedTechnicians.push("Sans technicien");
      }

      setAllTechnicians(sortedTechnicians);

    } catch (error) {
      console.error('Erreur lors de la lecture du fichier Excel:', error);
    }
  };

  reader.onerror = (error) => {
    console.error('Erreur lors de la lecture du fichier:', error);
  };

  reader.readAsBinaryString(file);
};

  const handleExportExcel = (): void => {
    const dataToExport = (isFiltering ? filteredData : data).map(row => {
      const formattedRow = [...row];
      
      if (row[2]) {
        const date = new Date(row[2]);
        formattedRow[2] = date.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      if (row[4]) {
        const date = new Date(row[4]);
        formattedRow[4] = date.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      
      return formattedRow;
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataToExport]);
    
    ws['!cols'] = headers.map((_, index) => {
      return index === 2 || index === 4 ? { wch: 12 } : { wch: 15 };
    });

    XLSX.utils.book_append_sheet(wb, ws, "Operations");
    const fileName = `operations_${selectedDate || new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
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

const handleTaskClick = (operationId: string): void => {
  // Vérifier si nous avons déjà des données filtrées pour cette opération
  const existingFilteredData = filterDataForDate(selectedDate, operationId);
  
  setSelectedTask(prevTask => {
    // Si on clique sur la même tâche, on désélectionne
    if (prevTask === operationId) {
      return null;
    }
    
    // Si les données filtrées sont vides ou si on a déjà plus d'une occurrence
    // on ne devrait pas sélectionner cette tâche
    if (!existingFilteredData.length || existingFilteredData.length > 1) {
      return prevTask;
    }
    
    return operationId;
  });
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

  const handleFilterChange = (header: string, value: string): void => {
    setFilters(prev => ({
      ...prev,
      [header]: value
    }));
  };

  const resetColumnVisibility = (): void => {
    setColumnVisibility(prev => 
      prev.map((col, index) => ({
        ...col,
        visible: [0,1,2,3,4,5,10,11,15,16].includes(index)
      }))
    );
  };
  
  const handleNewOperationChange = (
  field: keyof NewOperation,
  value: string
): void => {
  setNewOperation(prev => ({
    ...prev,
    [field]: value,
    ...(field === 'dateDebut' && !prev.dateFin && { dateFin: value })
  }));
};

const validateNewOperation = (): boolean => {
  const {
    vehicule,
    description,
    dateDebut,
    heureDebut,
    dateFin,
    heureFin,
    lieu
  } = newOperation;

  if (!vehicule || !description || !dateDebut || !dateFin || !lieu) {
    return false;
  }

  const start = new Date(`${dateDebut}T${heureDebut}`);
  const end = new Date(`${dateFin}T${heureFin}`);

  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return false;
  }

  return true;
};


const handleCreateOperation = (): void => {
  const newRow = new Array(headers.length).fill('');
  newRow[0] = newOperation.vehicule;
  newRow[1] = newOperation.description;
  
  // Date de début
  const startDate = new Date(newOperation.dateDebut);
  startDate.setHours(12, 0, 0, 0);
  newRow[2] = startDate.toISOString().split('T')[0];
  newRow[3] = newOperation.heureDebut;
  
  // Date de fin
  const endDate = new Date(newOperation.dateFin);
  endDate.setHours(12, 0, 0, 0);
  newRow[4] = endDate.toISOString().split('T')[0];
  newRow[5] = newOperation.heureFin;
  
  newRow[10] = newOperation.lieu;
  newRow[15] = newOperation.technicien || "Sans technicien";

  setData(prevData => [...prevData, newRow]);

  if (newOperation.dateDebut && newOperation.dateFin) {
    const newDates = generateDateRange(startDate, endDate);
    setUniqueDates(prevDates => {
      const allDates = new Set([...prevDates, ...newDates]);
      return Array.from(allDates).sort();
    });
  }

  setNewOperation(initialNewOperation);
  setIsNewOperationDialogOpen(false);
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

  const renderNewOperationDialog = (): React.ReactNode => {
    return (
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
  };

  const renderTimeHeader = ({ HEADER_HEIGHT }: Pick<RenderProps, 'HEADER_HEIGHT'>): React.ReactNode => {
    return (
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
  };

  const renderDateSelector = (): React.ReactNode => {
    return (
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
  };

  const renderTechnicianInput = (): React.ReactNode => {
    return (
      <div className="flex gap-2 w-full items-center">
        <Input
          type="text"
          value={newTechnician}
          onChange={(e) => setNewTechnician(e.target.value)}
          placeholder="Nouveau technicien"
          className="flex-1"
        />
        <Button
          onClick={() => {
            if (newTechnician.trim() && newTechnician.trim().toLowerCase() !== 'sans technicien') {
              const updatedTechnicians = [...allTechnicians];
              const hasSansTechnicien = updatedTechnicians.includes("Sans technicien");
              const filteredTechnicians = updatedTechnicians.filter(tech => tech !== "Sans technicien");
              if (!filteredTechnicians.includes(newTechnician.trim())) {
                filteredTechnicians.push(newTechnician.trim());
                filteredTechnicians.sort((a, b) => a.localeCompare(b));
                if (hasSansTechnicien) {
                  filteredTechnicians.push("Sans technicien");
                }
                setAllTechnicians(filteredTechnicians);
                setNewTechnician('');
              }
            }
          }}
          disabled={!newTechnician.trim() || newTechnician.trim().toLowerCase() === 'sans technicien'}
        >
          Ajouter Technicien
        </Button>
      </div>
    );
  };
 const renderTable = (dataToRender: string[][]): React.ReactNode => {
  const visibleColumns = getVisibleColumns();
  
  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto">
        <table className="min-w-full border border-gray-300" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky top-0 bg-gray-800 text-white py-3 px-4 text-left text-xs font-medium border border-gray-600">
                Actions
              </th>
              {headers.map((header, index) => {
                // Ne rendre que les colonnes visibles
                if (!visibleColumns.includes(index)) return null;
                
                return (
                  <th
                    key={`header-${index}`}
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
            </tr>
          </thead>
          <tbody className="bg-white">
            {dataToRender.map((row, rowIndex) => {
              const operationId = getOperationId(row);
              const uniqueRowId = `${operationId}_${rowIndex}`;
              const isEditing = editingRow === operationId;
              const isUnassigned = !row[2] || !row[4];
              const isTechnicianMissing = !row[15] || row[15] === "Sans technicien";

              return (
                <tr
                  key={uniqueRowId}
                  className={`
                    ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-100'}
                    ${isEditing ? 'bg-yellow-50' : ''}
                    ${isUnassigned ? 'bg-yellow-50' : ''}
                    ${isTechnicianMissing ? 'text-red-500' : ''}
                    hover:bg-blue-50 transition-colors duration-150
                  `}
                  onClick={() => !isEditing && handleTaskClick(operationId)}
                >
                  <td className="border border-gray-300 py-2 px-4">
                    <div className="flex justify-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveEdit(operationId);
                            }}
                            className="bg-green-500 text-white p-1 rounded hover:bg-green-600 transition-colors duration-150"
                            title="Enregistrer"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            className="bg-red-500 text-white p-1 rounded hover:bg-red-600 transition-colors duration-150"
                            title="Annuler"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(row);
                          }}
                          className="bg-blue-500 text-white p-1 rounded hover:bg-blue-600 transition-colors duration-150"
                          title="Modifier"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  {row.map((cell, cellIndex) => {
                    if (!visibleColumns.includes(cellIndex)) return null;
                    
                    const isDateCell = headers[cellIndex]?.toLowerCase().includes('date');
                    const isTimeCell = headers[cellIndex]?.toLowerCase().includes('heure');
                    
                    return (
                      <td
                        key={`${uniqueRowId}-cell-${cellIndex}`}
                        className={`
                          border border-gray-300 py-2 px-4 text-sm
                          ${isEditing ? 'p-0' : ''}
                        `}
                      >
                        <div className="truncate">
                          {isEditing ? (
                            isDateCell ? (
                              <input
                                type="date"
                                value={editedData[headers[cellIndex]] || ''}
                                onChange={(e) => handleInputChange(headers[cellIndex], e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full p-1 border rounded"
                              />
                            ) : isTimeCell ? (
                              <input
                                type="time"
                                value={editedData[headers[cellIndex]] || ''}
                                onChange={(e) => handleInputChange(headers[cellIndex], e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full p-1 border rounded"
                              />
                            ) : (
                              <input
                                type="text"
                                value={editedData[headers[cellIndex]] || ''}
                                onChange={(e) => handleInputChange(headers[cellIndex], e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full p-1 border rounded"
                              />
                            )
                          ) : (
                            cell || ''
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

  const renderGanttView = (groupBy: string, showTechnicianInput: boolean = false): React.ReactNode => {
    return (
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
  };

  const getDragMessage = (): React.ReactNode => {
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
  };

const renderTopActions = (): React.ReactNode => {
  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm">
      <input 
        type="file" 
        onChange={handleFileUpload} 
        accept=".xlsx,.xls" // Modification ici pour accepter les fichiers Excel
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
        onClick={handleExportExcel}
        className="gap-2"
        variant="outline"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Exporter Excel
      </Button>
    </div>
  );
};

  const renderFilterReset = (): React.ReactNode => {
    if (!selectedTask) return null;

    return (
      <div className="flex items-center justify-end mb-4">
        <Button
          onClick={() => setSelectedTask(null)}
          variant="destructive"
          className="flex items-center gap-2"
        >
          <X className="h-4 w-4" />
          Réinitialiser le filtre
        </Button>
      </div>
    );
  };
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

  // Rendu final du composant
  return (
    <div className="container mx-auto p-4 min-h-screen bg-gray-50">
      <div className="mb-6 space-y-4">
        {renderTopActions()}
        {renderNewOperationDialog()}

        <div className="flex flex-wrap gap-2">
          {['Tableau', 'Vue Véhicule', 'Vue Lieu', 'Vue Technicien', 'Paramètres'].map((title, index) => (
            <Button
              key={index}
              onClick={() => setActiveTab(index)}
              variant={activeTab === index ? "default" : "outline"}
              className={`
                transition-all duration-200 flex items-center gap-2
                ${activeTab === index 
                  ? 'shadow-md scale-105' 
                  : 'hover:bg-gray-100'
                }
              `}
            >
              {title === 'Paramètres' && <Settings className="h-4 w-4" />}
              {title}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {activeTab === 0 && renderTable(filteredData)}
          {activeTab === 1 && renderGanttView('Véhicule')}
          {activeTab === 2 && renderGanttView('Lieu')}
          {activeTab === 3 && renderGanttView('Technicien', true)}
          {activeTab === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Paramètres d'affichage</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {columnVisibility.map((col) => (
                  <div key={col.index} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`col-${col.index}`}
                      checked={col.visible}
                      onChange={() => handleColumnVisibilityChange(col.index)}
                      className="w-4 h-4"
                    />
                    <label htmlFor={`col-${col.index}`}>
                      {col.name}
                    </label>
                  </div>
                ))}
              </div>
              <Button onClick={resetColumnVisibility} className="mt-4">
                Réinitialiser
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {draggedTask && getDragMessage()}
    </div>
  );
};

export default React.memo(CSVViewer);
