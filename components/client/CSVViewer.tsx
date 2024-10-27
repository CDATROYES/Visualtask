// Partie 1 - Imports, interfaces et initialisation du composant
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { parse, unparse } from 'papaparse';
import { Edit2, Save, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

// Interfaces principales
interface CSVResult {
  data: string[][];
  errors: any[];
  meta: any;
}

interface DraggedTaskData {
  task: string[];
  date: string;
  operationId: string;
  startDate: string;
  endDate: string;
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
}

interface EditingActions {
  row: string[];
  cell: string;
  header: string;
  index: number;
}

const CSVViewer: React.FC = () => {
  // États avec typage
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

  // Effet pour la touche F7
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7') {
        setIsFiltering(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fonctions utilitaires de base
  const isSameDay = (date1: string, date2: string) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const getOperationId = (task: string[]): string => {
    return `${task[0]}_${task[1]}_${task[2]}_${task[4]}`;
  };

  const getUniqueColor = (index: number): string => {
    const hue = (index * 137.508) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const getTimePercentage = (time: string): number => {
    if (!time) return 0;
    try {
      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) return 0;
      return ((hours * 60 + minutes) / (24 * 60)) * 100;
    } catch (err) {
      console.error('Erreur lors du calcul du pourcentage de temps:', err);
      return 0;
    }
  };
  // Partie 2 - Gestion des fichiers et traitement des données
const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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

      const allDates = new Set<string>();
      const technicianSet = new Set<string>();

      processedData.forEach((row: string[]) => {
        if (row[2] && row[4]) {
          const startDate = new Date(row[2]);
          const endDate = new Date(row[4]);

          for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            allDates.add(date.toISOString().split('T')[0]);
          }
        }
        if (row[15]) {
          technicianSet.add(row[15].trim());
        }
      });

      const sortedDates = Array.from(allDates)
        .filter(date => date)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      const sortedTechnicians = Array.from(technicianSet)
        .filter(tech => tech && tech !== "Sans technicien")
        .sort((a, b) => a.localeCompare(b));

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

const handleExportCSV = (): void => {
  const dataToExport = isFiltering ? filteredData : data;
  const csv = unparse({
    fields: headers,
    data: dataToExport
  });
  const fileName = `export_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, fileName);
};

const handleFilterChange = (header: string, value: string): void => {
  setFilters(prev => ({
    ...prev,
    [header]: value
  }));
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

const filteredData = data.filter(row => {
  return headers.every((header, index) => {
    const filterValue = (filters[header] || '').toLowerCase();
    const cellValue = (row[index] || '').toString().toLowerCase();
    return !filterValue || cellValue.includes(filterValue);
  });
});

const filterDataForDate = useCallback((dateStr: string): string[][] => {
  if (!dateStr || !data.length) return [];

  try {
    const dateObj = new Date(dateStr);
    dateObj.setHours(0, 0, 0, 0);

    return data
      .filter((row: string[]) => {
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
      })
      .map(row => {
        const adjustedRow = [...row];
        const startDate = new Date(adjustedRow[2]);
        const endDate = new Date(adjustedRow[4]);
        const currentDate = new Date(dateStr);

        if (startDate < currentDate && !isSameDay(startDate.toISOString(), currentDate.toISOString())) {
          adjustedRow[3] = '00:00';
        }
        if (endDate > currentDate && !isSameDay(endDate.toISOString(), currentDate.toISOString())) {
          adjustedRow[5] = '23:59';
        }

        return adjustedRow;
      });
  } catch (err) {
    console.error('Erreur lors du filtrage des données:', err);
    return [];
  }
}, [data, isSameDay]);
// Partie 3 - Gestion de l'édition

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

const handleInputChange = (header: string, value: string): void => {
  setEditedData(prev => ({
    ...prev,
    [header]: value
  }));
};

const groupDataByType = useCallback((groupBy: string, filteredDataForDate: string[][]): {
  groups: string[];
  groupIndex: number;
  labelIndex: number;
} => {
  let groupIndex: number;
  let labelIndex: number;
  let groups: string[] = [];

  switch (groupBy) {
    case 'Véhicule':
      groupIndex = 0;
      labelIndex = 1;
      groups = [...new Set(filteredDataForDate.map(row => row[groupIndex]))]
        .filter(Boolean)
        .sort();
      break;
    case 'Lieu':
      groupIndex = 10;
      labelIndex = 1;
      groups = [...new Set(filteredDataForDate.map(row => row[groupIndex]))]
        .filter(Boolean)
        .sort();
      break;
    case 'Technicien':
      groupIndex = 15;
      labelIndex = 15;
      groups = allTechnicians;
      break;
    default:
      return { groups: [], groupIndex: 0, labelIndex: 0 };
  }

  return { groups, groupIndex, labelIndex };
}, [allTechnicians]);

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

const detectOverlaps = (tasks: Array<{
  task: string[];
  startPercentage: number;
  duration: number;
}>): Map<string, number> => {
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

const renderCell = (row: string[], cell: string, header: string, index: number) => {
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
// Partie 4 - Gestion du drag & drop

const handleDragStart = (e: React.DragEvent<HTMLDivElement>, task: TaskData): void => {
  e.stopPropagation();
  const taskData: DraggedTaskData = {
    ...task,
    date: selectedDate,
    operationId: getOperationId(task.task),
    startDate: task.task[2],
    endDate: task.task[4],
    originalTechnician: task.task[15],
    startPercentage: task.startPercentage,
    duration: task.duration
  };

  setDraggedTask(taskData);

  // Créer un élément fantôme pour le drag
  const ghostElement = document.createElement('div');
  ghostElement.style.width = '100px';
  ghostElement.style.height = '30px';
  ghostElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  ghostElement.style.position = 'absolute';
  ghostElement.style.top = '-1000px';
  document.body.appendChild(ghostElement);

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setDragImage(ghostElement, 50, 15);

  setTimeout(() => document.body.removeChild(ghostElement), 0);
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

const handleDrop = useCallback((newTechnician: string, e: React.DragEvent<HTMLDivElement>): void => {
  e.preventDefault();
  e.stopPropagation();

  if (!draggedTask || !draggedTask.operationId) return;

  const { operationId, startDate, endDate, originalTechnician } = draggedTask;
  const selectedDateObj = new Date(selectedDate);
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);

  // Vérification des dates
  if (selectedDateObj < startDateObj || selectedDateObj > endDateObj) {
    console.log("Impossible de déplacer une tâche en dehors de sa période");
    setDropZoneActive(null);
    setDraggedTask(null);
    return;
  }

  // Vérification du technicien
  if (originalTechnician === newTechnician) {
    setDropZoneActive(null);
    return;
  }

  // Mise à jour de l'assignation
  updateAssignment(operationId, newTechnician);
  setDropZoneActive(null);
  setDraggedTask(null);
}, [draggedTask, selectedDate, updateAssignment]);

const getDatesRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);

  while (currentDate <= lastDate) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

const getDragMessage = (): React.ReactNode => {
  if (!draggedTask) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 px-4 py-2 rounded-lg shadow-lg">
      {draggedTask.task[2] !== selectedDate ? (
        <span className="text-red-600">
          Impossible de déplacer une tâche d'un autre jour ({draggedTask.task[2]})
        </span>
      ) : (
        "Glissez la tâche sur une ligne pour réaffecter au technicien correspondant"
      )}
    </div>
  );
};
// Partie 5 - Composants d'interface

interface RenderTimeHeaderProps {
  HEADER_HEIGHT: number;
}

interface RenderGanttTaskContentProps {
  task: string[];
  groupBy: string;
  labelIndex: number;
}

const renderTimeHeader = ({ HEADER_HEIGHT }: RenderTimeHeaderProps): React.ReactNode => (
  <div style={{ 
    height: `${HEADER_HEIGHT}px`, 
    borderBottom: '2px solid #333', 
    backgroundColor: '#f0f0f0', 
    position: 'relative'
  }}>
    {[...Array(24)].map((_, index) => (
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

const renderGanttTaskContent = ({ task, groupBy, labelIndex }: RenderGanttTaskContentProps): React.ReactNode => {
  if (!task) return null;
  if (groupBy === 'Technicien') {
    return (
      <div className="flex items-center gap-1 w-full overflow-hidden">
        <span className="truncate">
          {`${task[0] || 'N/A'} - ${task[1] || 'N/A'}`}
        </span>
        {task[2] && task[4] && !isSameDay(task[2], task[4]) && (
          <span className="flex-shrink-0 text-xs bg-blue-200 text-blue-800 px-1 rounded">
            Multi-jours
          </span>
        )}
      </div>
    );
  }
  return task[labelIndex] || 'N/A';
};

const renderTableHeader = (): React.ReactNode => (
  <tr>
    {headers.slice(0, 17).map((header, index) => (
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
    ))}
    <th className="sticky top-0 bg-gray-800 text-white py-3 px-4 text-left text-xs font-medium border border-gray-600">
      Actions
    </th>
  </tr>
);

const renderActionButtons = (operationId: string, isEditing: boolean): React.ReactNode => (
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
        onClick={() => handleEditClick(operationId)}
        className="bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
        title="Modifier"
      >
        <Edit2 className="h-4 w-4" />
      </button>
    )}
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

const renderTabButtons = (): React.ReactNode => (
  <div className="flex flex-wrap gap-2">
    {['Tableau', 'Vue Véhicule', 'Vue Lieu', 'Vue Technicien'].map((title, index) => (
      <button
        key={index}
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
);
// Partie 6 - Visualisations principales (tableau et Gantt)

interface GanttChartData {
  group: string;
  tasks: TaskData[];
  overlaps: Map<string, number>;
  rowHeight: number;
}

const renderTable = (dataToRender: string[][]): React.ReactNode => (
  <div className="w-full">
    <div className="flex justify-between items-center mb-4 p-4 bg-gray-50 rounded-lg">
      <h2 className="text-lg font-semibold">Vue Tableau</h2>
      <button
        onClick={handleExportCSV}
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 
                 transition-colors duration-200 flex items-center gap-2"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
          />
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

            return (
              <tr
                key={operationId}
                className={`
                  ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-100'}
                  ${isEditing ? 'bg-yellow-50' : ''}
                  hover:bg-blue-50
                `}
              >
                {row.slice(0, 17).map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border border-gray-300 py-2 px-4 text-sm"
                  >
                    <div className="truncate">
                      {renderCell(row, cell, headers[cellIndex], cellIndex)}
                    </div>
                  </td>
                ))}
                <td className="border border-gray-300 py-2 px-4">
                  {renderActionButtons(operationId, isEditing)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

  const selectedDateObj = new Date(selectedDate);
  const filteredDataForDate = filterDataForDate(selectedDate);
  const { groups = [], groupIndex = 0, labelIndex = 0 } = groupDataByType(groupBy, filteredDataForDate) || {};

  if (!groups.length) {
    return <p>Aucune donnée à afficher pour cette date</p>;
  }

  const groupedData: GanttChartData[] = groups.map(group => {
    const tasks = filteredDataForDate
      .filter(row => row && row[groupIndex] === group)
      .map(task => ({
        task,
        startPercentage: getTimePercentage(task[3]),
        duration: Math.max(0.5, getTimePercentage(task[5]) - getTimePercentage(task[3])),
        operationId: getOperationId(task),
        isMultiDay: task[2] && task[4] && !isSameDay(task[2], task[4]),
        isStart: task[2] && isSameDay(task[2], selectedDate),
        isEnd: task[4] && isSameDay(task[4], selectedDate)
      }));

    const overlaps = detectOverlaps(tasks);
    const maxOverlap = Math.max(0, ...Array.from(overlaps.values()));
    const rowHeight = Math.max(MIN_ROW_HEIGHT, (maxOverlap + 1) * (TASK_HEIGHT + TASK_MARGIN) + TASK_MARGIN * 2);

    return { group, tasks, overlaps, rowHeight };
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
          {groupedData.map(({ group, rowHeight }, index) => (
            <div 
              key={group} 
              style={{ height: `${rowHeight}px` }}
              className={`
                flex items-center px-2.5 border-b border-gray-200
                ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
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
          {groupedData.map(({ group, tasks, overlaps, rowHeight }, index) => (
            <div 
              key={group}
              style={{ height: `${rowHeight}px` }}
              className={`
                relative border-b border-gray-200
                ${dropZoneActive === group ? 'bg-blue-50' : index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
              `}
              onDragOver={groupBy === 'Technicien' ? handleDragOver : undefined}
              onDragEnter={groupBy === 'Technicien' ? (e) => handleDragEnter(e, group) : undefined}
              onDragLeave={groupBy === 'Technicien' ? (e) => handleDragLeave(e, group) : undefined}
              onDrop={groupBy === 'Technicien' ? (e) => handleDrop(group, e) : undefined}
            >
              {tasks.map((taskData) => {
                const verticalPosition = overlaps.get(taskData.operationId) || 0;
                return (
                  <div
                    key={`${taskData.operationId}_${selectedDate}`}
                    draggable={groupBy === 'Technicien'}
                    onDragStart={(e) => handleDragStart(e, taskData)}
                    onDragEnd={handleDragEnd}
                    style={{
                      position: 'absolute',
                      left: `${taskData.startPercentage}%`,
                      width: `${taskData.duration}%`,
                      height: `${TASK_HEIGHT}px`,
                      top: TASK_MARGIN + (verticalPosition * (TASK_HEIGHT + TASK_MARGIN)),
                      backgroundColor: getUniqueColor(tasks.indexOf(taskData)),
                      borderLeft: !taskData.isStart ? '4px solid rgba(0,0,0,0.3)' : undefined,
                      borderRight: !taskData.isEnd ? '4px solid rgba(0,0,0,0.3)' : undefined
                    }}
                    className="rounded px-1 text-xs text-white overflow-hidden whitespace-nowrap select-none cursor-grab"
                  >
                    {renderGanttTaskContent({ task: taskData.task, groupBy, labelIndex })}
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
// Partie 7 - Rendu principal et export du composant

interface TabContentItem {
  title: string;
  content: React.ReactNode;
}

const tabContent: TabContentItem[] = [
  { 
    title: 'Tableau', 
    content: renderTable(filteredData) 
  },
  {
    title: 'Vue Véhicule',
    content: (
      <div className="space-y-8">
        {renderDateSelector()}
        <div className="space-y-6">
          {/* Section Gantt */}
          <div className="relative bg-white rounded-lg shadow-sm">
            {renderGanttChart('Véhicule')}
          </div>

          {/* Section Tableau */}
          {selectedDate && (
            <div className="mt-8 border-t-2 border-gray-200 pt-8">
              <h3 className="text-lg font-semibold mb-4">
                Détails des opérations pour le {selectedDate}
              </h3>
              {renderTable(filterDataForDate(selectedDate))}
            </div>
          )}
        </div>
      </div>
    )
  },
  {
    title: 'Vue Lieu',
    content: (
      <div className="space-y-8">
        {renderDateSelector()}
        <div className="space-y-6">
          {/* Section Gantt */}
          <div className="relative bg-white rounded-lg shadow-sm">
            {renderGanttChart('Lieu')}
          </div>

          {/* Section Tableau */}
          {selectedDate && (
            <div className="mt-8 border-t-2 border-gray-200 pt-8">
              <h3 className="text-lg font-semibold mb-4">
                Détails des opérations pour le {selectedDate}
              </h3>
              {renderTable(filterDataForDate(selectedDate))}
            </div>
          )}
        </div>
      </div>
    )
  },
  {
    title: 'Vue Technicien',
    content: (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          {renderDateSelector()}
          {renderTechnicianInput()}
        </div>

        <div className="space-y-6">
          {/* Section Gantt */}
          <div className="relative bg-white rounded-lg shadow-sm">
            {renderGanttChart('Technicien')}
          </div>

          {draggedTask && getDragMessage()}

          <div className="text-sm text-gray-500 italic">
            Note : Les tâches sans technicien sont affichées en rouge au bas du planning.
            Les tâches sur plusieurs jours sont indiquées par des bordures spéciales.
          </div>

          {/* Section Tableau */}
          {selectedDate && (
            <div className="mt-8 border-t-2 border-gray-200 pt-8">
              <h3 className="text-lg font-semibold mb-4">
                Détails des opérations pour le {selectedDate}
              </h3>
              {renderTable(filterDataForDate(selectedDate))}
            </div>
          )}
        </div>
      </div>
    )
  }
];

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
