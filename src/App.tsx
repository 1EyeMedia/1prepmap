import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  LogOut, 
  LogIn, 
  Check, 
  Edit2,
  X,
  AlertCircle,
  Loader2,
  BookOpen,
  LayoutGrid
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

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-display font-bold text-white tracking-tight">{title}</h3>
            <button onClick={onClose} className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          {children}
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
        className="w-full px-5 py-4 mb-8 text-white transition-all border outline-none bg-black border-white/10 rounded-2xl focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 font-medium placeholder:text-white/20"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onSubmit(value);
            onClose();
          }
        }}
      />
      <div className="flex gap-4">
        <button 
          onClick={onClose}
          className="flex-1 py-4 font-semibold text-white/70 transition-all rounded-2xl bg-white/5 hover:bg-white/10 hover:text-white active:scale-95"
        >
          Cancel
        </button>
        <button 
          onClick={() => {
            if (value.trim()) {
              onSubmit(value);
              onClose();
            }
          }}
          className="flex-1 py-4 font-semibold text-white transition-all bg-indigo-600 rounded-2xl hover:bg-indigo-500 active:scale-95 shadow-[0_0_20px_rgba(79,70,229,0.3)]"
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
    <div className="flex items-start gap-4 mb-8 text-red-400/90 bg-red-500/10 p-4 rounded-2xl border border-red-500/20">
      <AlertCircle size={24} className="shrink-0 mt-0.5" />
      <p className="text-sm font-medium leading-relaxed">{message}</p>
    </div>
    <div className="flex gap-4">
      <button 
        onClick={onClose}
        className="flex-1 py-4 font-semibold text-white/70 transition-all rounded-2xl bg-white/5 hover:bg-white/10 hover:text-white active:scale-95"
      >
        Cancel
      </button>
      <button 
        onClick={() => {
          onConfirm();
          onClose();
        }}
        className="flex-1 py-4 font-semibold text-white transition-all bg-red-600 rounded-2xl hover:bg-red-500 active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
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
  const [isEditMode, setIsEditMode] = useState(false);

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
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    if (user) {
      // Cloud Sync
      const userDocRef = doc(db, 'users', user.uid);
      
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const cloudData = docSnap.data() as AppData;
          setData(cloudData);
          // Use functional update to avoid stale closure of activeSubjectId
          setActiveSubjectId(prev => {
            if (prev) return prev;
            return cloudData.subjects.length > 0 ? cloudData.subjects[0].id : '';
          });
        } else {
          // New user, check for local data to migrate
          const localDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
          const initialData = localDataStr ? JSON.parse(localDataStr) : DEFAULT_DATA;
          setDoc(userDocRef, initialData).catch(console.error);
          setData(initialData);
          setActiveSubjectId(prev => {
            if (prev) return prev;
            return initialData.subjects.length > 0 ? initialData.subjects[0].id : '';
          });
        }
        setIsLoading(false);
      }, (error) => {
        console.error("Firestore Error: ", error);
        setIsLoading(false);
      });

      return () => unsubscribe();
    } else {
      // Local Storage
      const localDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localDataStr) {
        try {
          const parsed = JSON.parse(localDataStr);
          setData(parsed);
          setActiveSubjectId(prev => {
            if (prev) return prev;
            return parsed.subjects.length > 0 ? parsed.subjects[0].id : '';
          });
        } catch (e) {
          console.error("Failed to parse local data", e);
          setData(DEFAULT_DATA);
          setActiveSubjectId(prev => prev || (DEFAULT_DATA.subjects[0]?.id || ''));
        }
      } else {
        setData(DEFAULT_DATA);
        setActiveSubjectId(prev => prev || (DEFAULT_DATA.subjects[0]?.id || ''));
      }
      setIsLoading(false);
    }
  }, [user, isAuthReady]);

  // Save to local storage when not logged in
  useEffect(() => {
    if (isAuthReady && !user && !isLoading) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, user, isAuthReady, isLoading]);

  // --- Handlers ---

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setData(DEFAULT_DATA);
      setActiveSubjectId(DEFAULT_DATA.subjects[0].id);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const updateData = async (newData: AppData) => {
    setData(newData);
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), newData);
      } catch (error) {
        console.error("Failed to save to cloud", error);
      }
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prepmap-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (importedData.columns && importedData.subjects) {
          await updateData(importedData);
          if (importedData.subjects.length > 0) {
            setActiveSubjectId(importedData.subjects[0].id);
          }
        } else {
          alert("Invalid file format.");
        }
      } catch (error) {
        console.error("Import failed", error);
        alert("Failed to parse the file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Data Mutations ---

  const toggleProgress = (chapterId: string, columnId: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (!subject) return;
    
    const chapter = subject.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    chapter.progress[columnId] = !chapter.progress[columnId];
    updateData(newData);
  };

  const handleAddSubject = (name: string) => {
    const newSubject: Subject = {
      id: `s_${Date.now()}`,
      name,
      chapters: []
    };
    const newData = { ...data, subjects: [...data.subjects, newSubject] };
    updateData(newData);
    setActiveSubjectId(newSubject.id);
  };

  const handleEditSubject = (id: string, newName: string) => {
    const newData = {
      ...data,
      subjects: data.subjects.map(s => s.id === id ? { ...s, name: newName } : s)
    };
    updateData(newData);
  };

  const handleDeleteSubject = (id: string) => {
    const newData = {
      ...data,
      subjects: data.subjects.filter(s => s.id !== id)
    };
    updateData(newData);
    if (activeSubjectId === id) {
      setActiveSubjectId(newData.subjects[0]?.id || '');
    }
  };

  const handleAddChapter = (name: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (!subject) return;

    subject.chapters.push({
      id: `ch_${Date.now()}`,
      name,
      progress: {}
    });
    updateData(newData);
  };

  const handleEditChapter = (id: string, newName: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (!subject) return;

    const chapter = subject.chapters.find(c => c.id === id);
    if (chapter) chapter.name = newName;
    updateData(newData);
  };

  const handleDeleteChapter = (id: string) => {
    const newData = { ...data };
    const subject = newData.subjects.find(s => s.id === activeSubjectId);
    if (!subject) return;

    subject.chapters = subject.chapters.filter(c => c.id !== id);
    updateData(newData);
  };

  const handleAddColumn = (name: string) => {
    const newColumn: Column = {
      id: `c_${Date.now()}`,
      name
    };
    updateData({ ...data, columns: [...data.columns, newColumn] });
  };

  const handleEditColumn = (id: string, newName: string) => {
    updateData({
      ...data,
      columns: data.columns.map(c => c.id === id ? { ...c, name: newName } : c)
    });
  };

  const handleDeleteColumn = (id: string) => {
    const newData = {
      ...data,
      columns: data.columns.filter(c => c.id !== id)
    };
    // Clean up progress references
    newData.subjects.forEach(subject => {
      subject.chapters.forEach(chapter => {
        delete chapter.progress[id];
      });
    });
    updateData(newData);
  };

  // --- Derived State ---

  const globalProgress = useMemo(() => {
    if (!data.subjects.length || !data.columns.length) return 0;
    
    let totalTasks = 0;
    let completedTasks = 0;

    data.subjects.forEach(subject => {
      subject.chapters.forEach(chapter => {
        data.columns.forEach(col => {
          totalTasks++;
          if (chapter.progress[col.id]) completedTasks++;
        });
      });
    });

    return totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  }, [data]);

  const activeSubject = data.subjects.find(s => s.id === activeSubjectId);

  // --- Render ---

  if (isLoading || !isAuthReady) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans relative selection:bg-indigo-500/30">
      
      {/* --- Background Noise & Gradient --- */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      {/* --- Floating Header --- */}
      <header className="fixed top-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] md:w-[calc(100%-3rem)] max-w-7xl z-40">
        <div className="bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/10 rounded-3xl px-4 md:px-6 py-4 flex items-center justify-between shadow-2xl">
          
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                <LayoutGrid size={16} className="text-white" />
              </div>
              <h1 className="text-xl md:text-2xl font-display font-bold tracking-tight text-white hidden sm:block">PrepMap</h1>
            </div>
            
            <div className="h-6 w-px bg-white/10 hidden md:block" />
            
            <div className="flex items-center gap-3 md:gap-4">
              <div className="w-24 md:w-48 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.8)]" 
                  initial={{ width: 0 }} 
                  animate={{ width: `${globalProgress}%` }} 
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
              <span className="text-xs md:text-sm font-medium text-white/60 tabular-nums">{globalProgress}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border",
                isEditMode 
                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_15px_rgba(79,70,229,0.2)]" 
                  : "bg-white/5 text-white/40 border-white/5 hover:text-white/60"
              )}
            >
              {isEditMode ? "EXIT EDIT" : "EDIT MODE"}
            </button>

            <div className="flex items-center bg-white/5 rounded-2xl p-1 border border-white/5">
              <button 
                onClick={handleExport}
                className="p-2.5 transition-all rounded-xl hover:bg-white/10 active:scale-95 text-white/50 hover:text-white"
                title="Export Data"
              >
                <Download size={18} />
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 transition-all rounded-xl hover:bg-white/10 active:scale-95 text-white/50 hover:text-white"
                title="Import Data"
              >
                <Upload size={18} />
                <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
              </button>
            </div>
            
            {user ? (
              <div className="flex items-center gap-3 pl-2 md:pl-4 border-l border-white/10">
                <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-10 h-10 rounded-xl border border-white/10" />
                <button 
                  onClick={handleLogout}
                  className="p-2.5 transition-all rounded-xl bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/5 active:scale-95"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-5 py-2.5 font-semibold text-white transition-all bg-indigo-600 rounded-xl hover:bg-indigo-500 active:scale-95 shadow-[0_0_20px_rgba(79,70,229,0.3)]"
              >
                <LogIn size={18} />
                <span className="hidden md:inline">Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="relative z-10 max-w-7xl mx-auto pt-36 pb-24 px-4 md:px-6 space-y-10">
        
        {/* Subject Selector */}
        <section>
          <div className="flex items-center gap-2 p-1.5 bg-white/5 rounded-2xl backdrop-blur-md border border-white/10 w-max max-w-full overflow-x-auto scrollbar-none">
            {data.subjects.map(subject => {
              const isActive = activeSubjectId === subject.id;
              return (
                <button
                  key={subject.id}
                  onClick={() => setActiveSubjectId(subject.id)}
                  className={cn(
                    "relative px-6 py-3 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap group",
                    isActive ? "text-white" : "text-white/50 hover:text-white"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeSubject"
                      className="absolute inset-0 bg-white/10 rounded-xl border border-white/10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {subject.name}
                    {isActive && isEditMode && (
                      <span className="flex gap-1.5 ml-2">
                        <Edit2 
                          size={12} 
                          className="opacity-50 hover:opacity-100 transition-opacity" 
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
                        />
                        <Trash2 
                          size={12} 
                          className="opacity-50 hover:opacity-100 text-red-400 transition-opacity" 
                          onClick={(e) => { 
                            e.stopPropagation();
                            setConfirmConfig({
                              isOpen: true,
                              title: 'Delete Subject',
                              message: `Are you sure you want to delete "${subject.name}"? All chapters and progress will be lost.`,
                              onConfirm: () => handleDeleteSubject(subject.id)
                            });
                          }} 
                        />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {isEditMode && (
              <button 
                className="px-5 py-3 text-white/50 hover:text-white hover:bg-white/5 rounded-xl transition-colors" 
                onClick={() => setPromptConfig({
                  isOpen: true,
                  title: 'New Subject',
                  placeholder: 'Enter subject name...',
                  onSubmit: handleAddSubject
                })}
              >
                <Plus size={18} />
              </button>
            )}
          </div>
        </section>

        {/* Matrix Table */}
        {activeSubject && (
          <section>
            <div className="bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <th className="p-6 text-left font-semibold text-white/40 uppercase tracking-widest text-xs min-w-[250px]">
                        <div className="flex items-center justify-between">
                          <span>Module</span>
                          {isEditMode && (
                            <button 
                              onClick={() => setPromptConfig({
                                isOpen: true,
                                title: 'New Chapter',
                                placeholder: 'Chapter Name',
                                onSubmit: handleAddChapter
                              })}
                              className="p-1.5 bg-white/5 text-white/70 rounded-lg hover:bg-white/10 hover:text-white transition-all active:scale-95"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      </th>
                      {data.columns.map(col => (
                        <th key={col.id} className="p-6 text-center font-semibold text-white/40 uppercase tracking-widest text-xs min-w-[140px] group relative">
                          {col.name}
                          {isEditMode && (
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setPromptConfig({
                                  isOpen: true,
                                  title: 'Rename Column',
                                  placeholder: 'Column Name',
                                  initialValue: col.name,
                                  onSubmit: (val) => handleEditColumn(col.id, val)
                                })}
                                className="p-1 bg-[#111] border border-white/10 rounded-md text-white/70 hover:text-white"
                              >
                                <Edit2 size={10} />
                              </button>
                              <button 
                                onClick={() => setConfirmConfig({
                                  isOpen: true,
                                  title: 'Delete Column',
                                  message: `Delete column "${col.name}"? This will remove progress for all subjects.`,
                                  onConfirm: () => handleDeleteColumn(col.id)
                                })}
                                className="p-1 bg-[#111] border border-white/10 rounded-md text-red-400 hover:text-red-300"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          )}
                        </th>
                      ))}
                      <th className="p-6 w-16">
                        {isEditMode && (
                          <button 
                            onClick={() => setPromptConfig({
                              isOpen: true,
                              title: 'New Task Column',
                              placeholder: 'e.g., Final Review',
                              onSubmit: handleAddColumn
                            })}
                            className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all active:scale-95"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <motion.tbody 
                    className="divide-y divide-white/5"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      visible: { transition: { staggerChildren: 0.03 } }
                    }}
                  >
                    <AnimatePresence>
                      {activeSubject.chapters.map(chapter => (
                        <motion.tr 
                          key={chapter.id}
                          layout
                          variants={{
                            hidden: { opacity: 0, y: 10 },
                            visible: { opacity: 1, y: 0 }
                          }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="group hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="p-6">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white/90">{chapter.name}</span>
                              {isEditMode && (
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => setPromptConfig({
                                      isOpen: true,
                                      title: 'Edit Chapter',
                                      placeholder: 'Chapter Name',
                                      initialValue: chapter.name,
                                      onSubmit: (val) => handleEditChapter(chapter.id, val)
                                    })}
                                    className="p-1.5 text-white/30 hover:text-white transition-colors"
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
                                    className="p-1.5 text-red-400/50 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          {data.columns.map(col => {
                            const isDone = chapter.progress[col.id];
                            return (
                              <td key={col.id} className="p-4 text-center">
                                <motion.button 
                                  whileTap={{ scale: 0.85 }}
                                  onClick={() => toggleProgress(chapter.id, col.id)}
                                  className={cn(
                                    "w-10 h-10 rounded-xl mx-auto flex items-center justify-center transition-all duration-300",
                                    isDone 
                                      ? "bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]" 
                                      : "bg-white/5 border border-white/5 text-transparent hover:bg-white/10 hover:border-white/10"
                                  )}
                                >
                                  <Check size={18} strokeWidth={3} />
                                </motion.button>
                              </td>
                            );
                          })}
                          <td />
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {activeSubject.chapters.length === 0 && (
                      <tr>
                        <td colSpan={data.columns.length + 2} className="p-24 text-center">
                          <div className="flex flex-col items-center gap-4 text-white/30">
                            <BookOpen size={48} strokeWidth={1} />
                            <p className="text-sm font-medium uppercase tracking-widest">No Modules Found</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </motion.tbody>
                </table>
              </div>
            </div>
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
    </div>
  );
}
