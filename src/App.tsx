/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  LogOut, 
  LogIn, 
  Check, 
  ChevronRight, 
  Edit2,
  X,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  getDocFromServer 
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for Tailwind class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface Column {
  id: string;
  name: string;
}

interface Chapter {
  id: string;
  name: string;
  progress: Record<string, boolean>;
}

interface Subject {
  id: string;
  name: string;
  chapters: Chapter[];
}

interface AppData {
  columns: Column[];
  subjects: Subject[];
}

// --- Constants ---

const LOCAL_STORAGE_KEY = 'prepMapData_local';

const DEFAULT_DATA: AppData = {
  columns: [
    { id: 'c1', name: 'Notes' },
    { id: 'c2', name: 'Revision 1' },
    { id: 'c3', name: 'PYQs' },
    { id: 'c4', name: 'Mock Test' }
  ],
  subjects: [
    {
      id: 's1',
      name: 'Mathematics',
      chapters: [
        { id: 'ch1', name: 'Calculus', progress: {} },
        { id: 'ch2', name: 'Algebra', progress: {} }
      ]
    }
  ]
};

// --- Components ---

const GlassPanel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn(
    "bg-[rgba(20,20,25,0.4)] backdrop-blur-[24px] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl",
    className
  )}>
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-md"
        >
          <GlassPanel className="p-6 border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">{title}</h3>
              <button onClick={onClose} className="p-2 transition-colors rounded-full hover:bg-white/10">
                <X size={20} />
              </button>
            </div>
            {children}
          </GlassPanel>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const PromptModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  title, 
  placeholder, 
  initialValue = '' 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSubmit: (value: string) => void; 
  title: string; 
  placeholder: string;
  initialValue?: string;
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 mb-6 text-white transition-all border outline-none bg-white/5 border-white/10 rounded-xl focus:border-purple-500/50 focus:bg-white/10"
        onKeyDown={(e) => e.key === 'Enter' && value.trim() && onSubmit(value)}
      />
      <div className="flex gap-3">
        <button 
          onClick={onClose}
          className="flex-1 py-3 font-medium transition-all rounded-xl bg-white/5 hover:bg-white/10 active:scale-95"
        >
          Cancel
        </button>
        <button 
          onClick={() => value.trim() && onSubmit(value)}
          className="flex-1 py-3 font-medium text-black transition-all bg-gradient-to-r from-blue-400 to-purple-400 rounded-xl hover:opacity-90 active:scale-95"
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
};

const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string; 
  message: string;
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title}>
    <div className="flex items-center gap-4 mb-6 text-red-400/80">
      <AlertCircle size={32} />
      <p className="text-gray-300">{message}</p>
    </div>
    <div className="flex gap-3">
      <button 
        onClick={onClose}
        className="flex-1 py-3 font-medium transition-all rounded-xl bg-white/5 hover:bg-white/10 active:scale-95"
      >
        Cancel
      </button>
      <button 
        onClick={onConfirm}
        className="flex-1 py-3 font-medium text-white transition-all bg-red-500/80 rounded-xl hover:bg-red-500 active:scale-95"
      >
        Delete
      </button>
    </div>
  </Modal>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [data, setData] = useState<AppData>(DEFAULT_DATA);
  const [activeSubjectId, setActiveSubjectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Modal States
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    placeholder: string;
    initialValue?: string;
    onSubmit: (value: string) => void;
  }>({ isOpen: false, title: '', placeholder: '', onSubmit: () => {} });

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Auth & Data Sync ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    if (user) {
      // Sync with Firestore
      const userDocRef = doc(db, 'users', user.uid);
      
      // Test connection
      const testConnection = async () => {
        try {
          await getDocFromServer(userDocRef);
        } catch (error: any) {
          if (error.message?.includes('the client is offline')) {
            console.error("Firebase connection error: Client is offline.");
          }
        }
      };
      testConnection();

      const unsub = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const cloudData = docSnap.data() as AppData;
          setData(cloudData);
          if (!activeSubjectId && cloudData.subjects.length > 0) {
            setActiveSubjectId(cloudData.subjects[0].id);
          }
        } else {
          // Initialize cloud with local or default data
          const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
          const initialData = localData ? JSON.parse(localData) : DEFAULT_DATA;
          setDoc(userDocRef, initialData);
        }
        setIsLoading(false);
      }, (error) => {
        console.error("Firestore Error:", error);
        setIsLoading(false);
      });
      return unsub;
    } else {
      // Fallback to LocalStorage
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) {
        const parsed = JSON.parse(localData);
        setData(parsed);
        if (parsed.subjects.length > 0) {
          setActiveSubjectId(parsed.subjects[0].id);
        }
      } else {
        setData(DEFAULT_DATA);
        setActiveSubjectId(DEFAULT_DATA.subjects[0].id);
      }
      setIsLoading(false);
    }
  }, [user, isAuthReady]);

  // Save data whenever it changes
  const saveData = async (newData: AppData) => {
    setData(newData);
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), newData);
      } catch (error) {
        console.error("Error saving to Firestore:", error);
      }
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newData));
    }
  };

  // --- Logic ---

  const activeSubject = useMemo(() => 
    data.subjects.find(s => s.id === activeSubjectId) || data.subjects[0]
  , [data.subjects, activeSubjectId]);

  useEffect(() => {
    if (activeSubject && activeSubject.id !== activeSubjectId) {
      setActiveSubjectId(activeSubject.id);
    }
  }, [activeSubject]);

  const globalProgress = useMemo(() => {
    let totalCells = 0;
    let checkedCells = 0;
    data.subjects.forEach(subject => {
      subject.chapters.forEach(chapter => {
        data.columns.forEach(column => {
          totalCells++;
          if (chapter.progress[column.id]) checkedCells++;
        });
      });
    });
    return totalCells === 0 ? 0 : Math.round((checkedCells / totalCells) * 100);
  }, [data]);

  const toggleProgress = (chapterId: string, columnId: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (!subject) return;
    const chapter = subject.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    chapter.progress = {
      ...chapter.progress,
      [columnId]: !chapter.progress[columnId]
    };
    saveData(newData);
  };

  // --- Actions ---

  const handleAddSubject = (name: string) => {
    const id = `s_${Date.now()}`;
    const newData = {
      ...data,
      subjects: [...data.subjects, { id, name, chapters: [] }]
    };
    saveData(newData);
    setActiveSubjectId(id);
    setPromptConfig({ ...promptConfig, isOpen: false });
  };

  const handleEditSubject = (id: string, newName: string) => {
    const newData = {
      ...data,
      subjects: data.subjects.map(s => s.id === id ? { ...s, name: newName } : s)
    };
    saveData(newData);
    setPromptConfig({ ...promptConfig, isOpen: false });
  };

  const handleDeleteSubject = (id: string) => {
    const newData = {
      ...data,
      subjects: data.subjects.filter(s => s.id !== id)
    };
    if (activeSubjectId === id) {
      setActiveSubjectId(newData.subjects[0]?.id || '');
    }
    saveData(newData);
    setConfirmConfig({ ...confirmConfig, isOpen: false });
  };

  const handleAddChapter = (name: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (subject) {
      subject.chapters.push({ id: `ch_${Date.now()}`, name, progress: {} });
      saveData(newData);
    }
    setPromptConfig({ ...promptConfig, isOpen: false });
  };

  const handleEditChapter = (id: string, newName: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (subject) {
      const chapter = subject.chapters.find(c => c.id === id);
      if (chapter) chapter.name = newName;
      saveData(newData);
    }
    setPromptConfig({ ...promptConfig, isOpen: false });
  };

  const handleDeleteChapter = (id: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (subject) {
      subject.chapters = subject.chapters.filter(c => c.id !== id);
      saveData(newData);
    }
    setConfirmConfig({ ...confirmConfig, isOpen: false });
  };

  const handleAddColumn = (name: string) => {
    const newData = {
      ...data,
      columns: [...data.columns, { id: `c_${Date.now()}`, name }]
    };
    saveData(newData);
    setPromptConfig({ ...promptConfig, isOpen: false });
  };

  const handleEditColumn = (id: string, newName: string) => {
    const newData = {
      ...data,
      columns: data.columns.map(c => c.id === id ? { ...c, name: newName } : c)
    };
    saveData(newData);
    setPromptConfig({ ...promptConfig, isOpen: false });
  };

  const handleDeleteColumn = (id: string) => {
    const newData = {
      ...data,
      columns: data.columns.filter(c => c.id !== id),
      subjects: data.subjects.map(s => ({
        ...s,
        chapters: s.chapters.map(ch => {
          const { [id]: _, ...rest } = ch.progress;
          return { ...ch, progress: rest };
        })
      }))
    };
    saveData(newData);
    setConfirmConfig({ ...confirmConfig, isOpen: false });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prepmap_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (importedData.columns && importedData.subjects) {
          saveData(importedData);
        }
      } catch (err) {
        console.error("Import failed:", err);
      }
    };
    reader.readAsText(file);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setData(DEFAULT_DATA);
      setActiveSubjectId(DEFAULT_DATA.subjects[0].id);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f] text-white">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 size={48} className="text-purple-500" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200 font-sans relative overflow-hidden selection:bg-purple-500/30">
      {/* --- Animated Background --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/30 blur-[120px] rounded-full animate-blob mix-blend-screen" />
        <div className="absolute top-[20%] right-[-10%] w-[45%] h-[45%] bg-blue-600/30 blur-[120px] rounded-full animate-blob animation-delay-2000 mix-blend-screen" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-pink-600/20 blur-[120px] rounded-full animate-blob animation-delay-4000 mix-blend-screen" />
      </div>

      {/* --- Header --- */}
      <header className="sticky top-0 z-40 p-4 md:p-6">
        <GlassPanel className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-6 border-white/10">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              PrepMap
            </h1>
            <div className="h-8 w-px bg-white/10 hidden md:block" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Overall Mastery</span>
              <div className="flex items-center gap-3">
                <div className="w-32 md:w-48 h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${globalProgress}%` }}
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                  />
                </div>
                <span className="text-sm font-bold text-white">{globalProgress}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={handleExport}
              className="p-3 transition-all rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-gray-400 hover:text-white"
              title="Export Data"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-3 transition-all rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-gray-400 hover:text-white"
              title="Import Data"
            >
              <Upload size={20} />
              <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
            </button>
            <div className="w-px h-8 bg-white/10 mx-1" />
            {user ? (
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-10 h-10 rounded-xl border border-white/10" />
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2.5 font-medium transition-all rounded-xl bg-white/5 hover:bg-red-500/10 hover:text-red-400 active:scale-95"
                >
                  <LogOut size={18} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-6 py-2.5 font-bold text-black transition-all bg-gradient-to-r from-blue-400 to-purple-400 rounded-xl hover:opacity-90 active:scale-95"
              >
                <LogIn size={18} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </GlassPanel>
      </header>

      {/* --- Main Content --- */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 pb-24">
        
        {/* Subject Tabs */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <ChevronRight size={14} className="text-purple-500" />
              Your Subjects
            </h2>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {data.subjects.map(subject => (
              <div key={subject.id} className="group relative flex-shrink-0">
                <button
                  onClick={() => setActiveSubjectId(subject.id)}
                  className={cn(
                    "px-6 py-3 rounded-2xl font-medium transition-all duration-300 active:scale-95 border",
                    activeSubjectId === subject.id 
                      ? "bg-purple-500/20 border-purple-500/50 text-white shadow-[0_0_20px_rgba(168,85,247,0.2)]" 
                      : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:border-white/10"
                  )}
                >
                  {subject.name}
                </button>
                <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptConfig({
                        isOpen: true,
                        title: 'Rename Subject',
                        placeholder: 'Subject Name',
                        initialValue: subject.name,
                        onSubmit: (val) => handleEditSubject(subject.id, val)
                      });
                    }}
                    className="p-1.5 bg-gray-800 rounded-lg text-blue-400 hover:text-blue-300 border border-white/10"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmConfig({
                        isOpen: true,
                        title: 'Delete Subject',
                        message: `Are you sure you want to delete "${subject.name}"? All chapters and progress will be lost.`,
                        onConfirm: () => handleDeleteSubject(subject.id)
                      });
                    }}
                    className="p-1.5 bg-gray-800 rounded-lg text-red-400 hover:text-red-300 border border-white/10"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            <button 
              onClick={() => setPromptConfig({
                isOpen: true,
                title: 'New Subject',
                placeholder: 'Enter subject name...',
                onSubmit: handleAddSubject
              })}
              className="flex-shrink-0 p-3 rounded-2xl bg-white/5 border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/40 transition-all active:scale-95"
            >
              <Plus size={24} />
            </button>
          </div>
        </section>

        {/* Matrix Table */}
        {activeSubject && (
          <section className="space-y-6">
            <GlassPanel className="overflow-hidden border-white/5">
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="p-6 text-left min-w-[240px]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Chapter Name</span>
                          <button 
                            onClick={() => setPromptConfig({
                              isOpen: true,
                              title: 'New Chapter',
                              placeholder: 'Chapter Name',
                              onSubmit: handleAddChapter
                            })}
                            className="p-2 bg-purple-500/10 text-purple-400 rounded-xl hover:bg-purple-500/20 transition-all active:scale-95"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </th>
                      {data.columns.map(column => (
                        <th key={column.id} className="p-6 text-center min-w-[140px] group relative">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{column.name}</span>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setPromptConfig({
                                isOpen: true,
                                title: 'Rename Column',
                                placeholder: 'Column Name',
                                initialValue: column.name,
                                onSubmit: (val) => handleEditColumn(column.id, val)
                              })}
                              className="p-1 bg-gray-800 rounded-md text-blue-400"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button 
                              onClick={() => setConfirmConfig({
                                isOpen: true,
                                title: 'Delete Column',
                                message: `Delete column "${column.name}"? This will remove progress for all subjects.`,
                                onConfirm: () => handleDeleteColumn(column.id)
                              })}
                              className="p-1 bg-gray-800 rounded-md text-red-400"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="p-6 w-16">
                        <button 
                          onClick={() => setPromptConfig({
                            isOpen: true,
                            title: 'New Task Column',
                            placeholder: 'e.g., Revision 2',
                            onSubmit: handleAddColumn
                          })}
                          className="p-2 bg-white/5 text-gray-500 rounded-xl hover:text-white transition-all"
                        >
                          <Plus size={16} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activeSubject.chapters.map(chapter => (
                      <tr key={chapter.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="p-6">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-200">{chapter.name}</span>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setPromptConfig({
                                  isOpen: true,
                                  title: 'Edit Chapter',
                                  placeholder: 'Chapter Name',
                                  initialValue: chapter.name,
                                  onSubmit: (val) => handleEditChapter(chapter.id, val)
                                })}
                                className="p-2 text-blue-400/60 hover:text-blue-400"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => setConfirmConfig({
                                  isOpen: true,
                                  title: 'Delete Chapter',
                                  message: `Delete "${chapter.name}"?`,
                                  onConfirm: () => handleDeleteChapter(chapter.id)
                                })}
                                className="p-2 text-red-400/60 hover:text-red-400"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </td>
                        {data.columns.map(column => {
                          const isDone = chapter.progress[column.id];
                          return (
                            <td key={column.id} className="p-4 text-center">
                              <button
                                onClick={() => toggleProgress(chapter.id, column.id)}
                                className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all duration-300 active:scale-75",
                                  isDone 
                                    ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.6)]" 
                                    : "bg-white/5 border border-white/10 text-transparent hover:border-white/30 hover:bg-white/10"
                                )}
                              >
                                <Check size={20} strokeWidth={3} />
                              </button>
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    ))}
                    {activeSubject.chapters.length === 0 && (
                      <tr>
                        <td colSpan={data.columns.length + 2} className="p-12 text-center text-gray-500 italic">
                          No chapters added yet. Click the + icon to start.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassPanel>
          </section>
        )}
      </main>

      {/* --- Modals --- */}
      <PromptModal 
        isOpen={promptConfig.isOpen}
        onClose={() => setPromptConfig({ ...promptConfig, isOpen: false })}
        onSubmit={promptConfig.onSubmit}
        title={promptConfig.title}
        placeholder={promptConfig.placeholder}
        initialValue={promptConfig.initialValue}
      />

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
      />

      {/* --- Custom Styles --- */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 10s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }

        .scrollbar-thin::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
