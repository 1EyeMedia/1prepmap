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
      {/* --- Space Void Background --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Deep Void Base */}
        <div className="absolute inset-0 bg-[#020205]" />
        
        {/* Animated Stars */}
        <div className="stars-container absolute inset-0">
          <div className="stars" />
          <div className="stars2" />
          <div className="stars3" />
        </div>

        {/* Nebula Blobs */}
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-900/20 blur-[150px] rounded-full animate-pulse-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-900/20 blur-[150px] rounded-full animate-pulse-slow animation-delay-2000" />
        
        {/* Scanning Line Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-20" />
      </div>

      {/* --- Header --- */}
      <header className="sticky top-0 z-40 p-4 md:p-8">
        <GlassPanel className="max-w-7xl mx-auto px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-6 border-white/10 bg-black/40 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <h1 className="relative text-4xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent italic">
                PREPMAP
              </h1>
            </div>
            <div className="h-10 w-px bg-white/10 hidden md:block" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] mb-1">System Mastery</span>
              <div className="flex items-center gap-4">
                <div className="w-40 md:w-64 h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 p-[2px]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${globalProgress}%` }}
                    className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-full relative"
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] animate-shimmer" />
                  </motion.div>
                </div>
                <span className="text-lg font-black text-white tabular-nums">{globalProgress}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-white/5 rounded-2xl p-1 border border-white/10">
              <button 
                onClick={handleExport}
                className="p-3 transition-all rounded-xl hover:bg-white/10 active:scale-95 text-gray-400 hover:text-cyan-400"
                title="Export Data"
              >
                <Download size={20} />
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 transition-all rounded-xl hover:bg-white/10 active:scale-95 text-gray-400 hover:text-purple-400"
                title="Import Data"
              >
                <Upload size={20} />
                <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
              </button>
            </div>
            
            {user ? (
              <div className="flex items-center gap-4 pl-4 border-l border-white/10">
                <div className="relative">
                  <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-11 h-11 rounded-2xl border-2 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#0a0a0f] rounded-full" />
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-3 transition-all rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 border border-white/5 active:scale-95"
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="group relative px-8 py-3 font-black text-white transition-all active:scale-95 overflow-hidden rounded-2xl"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-purple-600 transition-transform group-hover:scale-110" />
                <div className="relative flex items-center gap-2">
                  <LogIn size={20} />
                  <span>INITIALIZE SYNC</span>
                </div>
              </button>
            )}
          </div>
        </GlassPanel>
      </header>

      {/* --- Main Content --- */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-12 pb-32 relative z-10">
        
        {/* Subject Tabs */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black text-cyan-400 uppercase tracking-[0.4em] flex items-center gap-3">
              <div className="w-8 h-[1px] bg-cyan-400/50" />
              Active Sectors
            </h2>
          </div>
          <div className="flex items-center gap-4 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {data.subjects.map(subject => (
              <div key={subject.id} className="group relative flex-shrink-0">
                <button
                  onClick={() => setActiveSubjectId(subject.id)}
                  className={cn(
                    "px-8 py-4 rounded-2xl font-black transition-all duration-500 active:scale-95 border-2 uppercase tracking-widest text-sm",
                    activeSubjectId === subject.id 
                      ? "bg-white text-black border-white shadow-[0_0_30px_rgba(255,255,255,0.2)]" 
                      : "bg-black/40 border-white/10 text-gray-500 hover:border-white/30 hover:text-white"
                  )}
                >
                  {subject.name}
                </button>
                <div className="absolute -top-3 -right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptConfig({
                        isOpen: true,
                        title: 'RECONFIGURE SECTOR',
                        placeholder: 'Sector Name',
                        initialValue: subject.name,
                        onSubmit: (val) => handleEditSubject(subject.id, val)
                      });
                    }}
                    className="p-2 bg-black border border-white/20 rounded-xl text-cyan-400 hover:bg-cyan-400 hover:text-black transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmConfig({
                        isOpen: true,
                        title: 'TERMINATE SECTOR',
                        message: `Permanently delete "${subject.name}" and all associated data?`,
                        onConfirm: () => handleDeleteSubject(subject.id)
                      });
                    }}
                    className="p-2 bg-black border border-white/20 rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button 
              onClick={() => setPromptConfig({
                isOpen: true,
                title: 'NEW SECTOR',
                placeholder: 'Enter sector name...',
                onSubmit: handleAddSubject
              })}
              className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/5 border-2 border-dashed border-white/10 text-gray-600 hover:text-white hover:border-white/40 transition-all active:scale-95 flex items-center justify-center"
            >
              <Plus size={28} />
            </button>
          </div>
        </section>

        {/* Matrix Table */}
        {activeSubject && (
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-black text-purple-400 uppercase tracking-[0.4em] flex items-center gap-3">
                <div className="w-8 h-[1px] bg-purple-400/50" />
                Progress Matrix
              </h2>
            </div>
            <GlassPanel className="overflow-hidden border-white/10 bg-black/60 shadow-2xl">
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="p-8 text-left min-w-[300px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Module Identifier</span>
                          <button 
                            onClick={() => setPromptConfig({
                              isOpen: true,
                              title: 'NEW MODULE',
                              placeholder: 'Module Name',
                              onSubmit: handleAddChapter
                            })}
                            className="p-2.5 bg-white/10 text-white rounded-xl hover:bg-white hover:text-black transition-all active:scale-90"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      </th>
                      {data.columns.map(column => (
                        <th key={column.id} className="p-8 text-center min-w-[160px] group relative">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">{column.name}</span>
                          <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <button 
                              onClick={() => setPromptConfig({
                                isOpen: true,
                                title: 'RENAME TASK',
                                placeholder: 'Task Name',
                                initialValue: column.name,
                                onSubmit: (val) => handleEditColumn(column.id, val)
                              })}
                              className="p-1.5 bg-black/80 rounded-lg text-cyan-400 hover:bg-cyan-400 hover:text-black transition-colors"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button 
                              onClick={() => setConfirmConfig({
                                isOpen: true,
                                title: 'DELETE TASK',
                                message: `Remove "${column.name}" from all sectors?`,
                                onConfirm: () => handleDeleteColumn(column.id)
                              })}
                              className="p-1.5 bg-black/80 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="p-8 w-20">
                        <button 
                          onClick={() => setPromptConfig({
                            isOpen: true,
                            title: 'NEW TASK TYPE',
                            placeholder: 'e.g., Final Review',
                            onSubmit: handleAddColumn
                          })}
                          className="p-3 bg-white/5 text-gray-600 rounded-2xl hover:text-white hover:bg-white/10 transition-all active:scale-90"
                        >
                          <Plus size={20} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activeSubject.chapters.map(chapter => (
                      <tr key={chapter.id} className="group hover:bg-white/[0.03] transition-all duration-300">
                        <td className="p-8">
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-bold text-white tracking-tight">{chapter.name}</span>
                            <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                              <button 
                                onClick={() => setPromptConfig({
                                  isOpen: true,
                                  title: 'RENAME MODULE',
                                  placeholder: 'Module Name',
                                  initialValue: chapter.name,
                                  onSubmit: (val) => handleEditChapter(chapter.id, val)
                                })}
                                className="p-2 text-gray-500 hover:text-cyan-400 transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => setConfirmConfig({
                                  isOpen: true,
                                  title: 'DELETE MODULE',
                                  message: `Permanently delete module "${chapter.name}"?`,
                                  onConfirm: () => handleDeleteChapter(chapter.id)
                                })}
                                className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </td>
                        {data.columns.map(column => {
                          const isDone = chapter.progress[column.id];
                          return (
                            <td key={column.id} className="p-6 text-center">
                              <button
                                onClick={() => toggleProgress(chapter.id, column.id)}
                                className={cn(
                                  "w-12 h-12 rounded-2xl flex items-center justify-center mx-auto transition-all duration-500 active:scale-50 relative group/btn",
                                  isDone 
                                    ? "bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.3)] scale-100" 
                                    : "bg-white/5 border-2 border-white/5 text-transparent hover:border-white/20 hover:bg-white/10 scale-90 hover:scale-100"
                                )}
                              >
                                {isDone && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={24} strokeWidth={4} /></motion.div>}
                                {!isDone && <div className="w-2 h-2 rounded-full bg-white/20 group-hover/btn:bg-white/40 transition-colors" />}
                              </button>
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    ))}
                    {activeSubject.chapters.length === 0 && (
                      <tr>
                        <td colSpan={data.columns.length + 2} className="p-20 text-center">
                          <div className="flex flex-col items-center gap-4 text-gray-600">
                            <AlertCircle size={48} strokeWidth={1} />
                            <p className="text-sm font-black uppercase tracking-[0.3em]">No Modules Detected in Sector</p>
                          </div>
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
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer { animation: shimmer 2s infinite; }
        
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
        .animate-pulse-slow { animation: pulse-slow 8s infinite ease-in-out; }

        /* Star Field Animation */
        .stars-container {
          background: radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%);
          overflow: hidden;
        }
        
        .stars, .stars2, .stars3 {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          display: block;
        }

        .stars {
          background: transparent url('https://s3-us-west-2.amazonaws.com/s.cdpn.io/123163/stars.png') repeat top center;
          z-index: 0;
          opacity: 0.5;
          animation: move-stars 200s linear infinite;
        }

        .stars2 {
          background: transparent url('https://s3-us-west-2.amazonaws.com/s.cdpn.io/123163/twinkling.png') repeat top center;
          z-index: 1;
          opacity: 0.3;
          animation: move-twinkling 150s linear infinite;
        }

        @keyframes move-stars {
          from { background-position: 0 0; }
          to { background-position: -10000px 5000px; }
        }

        @keyframes move-twinkling {
          from { background-position: 0 0; }
          to { background-position: -10000px 5000px; }
        }

        .scrollbar-thin::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
          border: 2px solid transparent;
          background-clip: padding-box;
        }
      `}</style>
    </div>
  );
}
