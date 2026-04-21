import React, { useState, useCallback, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Upload, 
  Download, 
  Image as ImageIcon, 
  Play, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  Settings2,
  ChevronRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Info,
  Palette,
  User,
  RefreshCcw,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import axios from 'axios';
import JSZip from 'jszip';
import { cn } from './lib/utils';

interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  timestamp: number;
}

const MODELS = [
  { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', description: 'Advanced image generation model', price: 0.007 },
  { id: 'imagen-3.0-fast-generate-002', name: 'Imagen 3 Fast', description: 'Google Imagen 3 Fast, high-speed iteration', price: 0.005 },
  { id: 'flux-1-dev', name: 'Flux 1 Dev', description: 'High-quality open-weights model', price: 0.015 },
  { id: 'flux-1-schnell', name: 'Flux 1 Schnell', description: 'Faster Flux model for quick iterations', price: 0.003 },
  { id: 'stability-ai/stable-diffusion-3', name: 'SD 3', description: 'Stability AI Stable Diffusion 3', price: 0.02 },
  { id: 'dall-e-3', name: 'DALL-E 3', description: 'OpenAI DALL-E 3 high quality', price: 0.04 },
];

const RATIOS = [
  { id: '1:1', name: 'Square', size: '1024x1024' },
  { id: '16:9', name: 'Landscape', size: '1792x1024' },
  { id: '9:16', name: 'Portrait', size: '1024x1792' },
  { id: '4:3', name: 'Standard Wide', size: '1024x768' },
];

export default function App() {
  const [prompts, setPrompts] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [selectedRatio, setSelectedRatio] = useState('16:9');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [styleRef, setStyleRef] = useState<string | null>(null);
  const [characterRef, setCharacterRef] = useState<string | null>(null);

  const [isRatioOpen, setIsRatioOpen] = useState(false);
  const ratioRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ratioRef.current && !ratioRef.current.contains(event.target as Node)) {
        setIsRatioOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getActivePrompts = () => prompts.split('\n').filter(p => p.trim());
  const modelInfo = MODELS.find(m => m.id === selectedModel);
  const totalPrice = (getActivePrompts().length * (modelInfo?.price || 0)).toFixed(3);

  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleStyleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await fileToDataURL(file);
        setStyleRef(dataUrl);
      } catch (err) {
        console.error("Failed to load style reference", err);
      }
    }
  };

  const handleCharacterRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await fileToDataURL(file);
        setCharacterRef(dataUrl);
      } catch (err) {
        console.error("Failed to load character reference", err);
      }
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      
      if (file.name.endsWith('.txt')) {
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setPrompts(prev => prev + (prev ? '\n' : '') + text);
        };
        reader.readAsText(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        reader.onload = (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          const newPrompts = json
            .map(row => (row as any)[0])
            .filter(p => p && (typeof p === 'string' || typeof p === 'number'))
            .map(p => String(p).trim())
            .filter(p => p.length > 0)
            .join('\n');
          setPrompts(prev => prev + (prev ? '\n' : '') + newPrompts);
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls', '.csv']
    },
    multiple: true
  });

  const generateOne = async (id: string, prompt: string) => {
    const size = RATIOS.find(r => r.id === selectedRatio)?.size || '1024x1024';
    
    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'processing', error: undefined } : img));
    
    try {
      const response = await axios.post('/api/generate', {
        prompt,
        model: selectedModel,
        ratio: selectedRatio,
        size: size,
        style_ref: styleRef,
        character_ref: characterRef
      });

      const imageUrl = response.data.data?.[0]?.url || response.data.url;
      if (!imageUrl) throw new Error("No image URL returned");

      setImages(prev => prev.map(img => 
        img.id === id ? { ...img, url: imageUrl, status: 'completed' } : img
      ));
    } catch (error: any) {
      console.error("Task failed:", error);
      setImages(prev => prev.map(img => 
        img.id === id ? { 
          ...img, 
          status: 'error', 
          error: error.response?.data?.error?.message || error.message || 'Request failed' 
        } : img
      ));
    }
  };

  const handleGenerate = async () => {
    const lines = prompts.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    if (lines.length === 0) return;

    setIsProcessing(true);
    setProgress(0);
    
    const newGenerations: GeneratedImage[] = lines.map(p => ({
      id: Math.random().toString(36).substr(2, 9),
      prompt: p,
      url: '',
      status: 'pending',
      timestamp: Date.now()
    }));

    setImages(prev => [...newGenerations, ...prev]);

    for (let i = 0; i < newGenerations.length; i++) {
      // Add a 9-second delay between requests to respect the 7req/min limit
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 9000));
      }
      await generateOne(newGenerations[i].id, newGenerations[i].prompt);
      setProgress(Math.round(((i + 1) / newGenerations.length) * 100));
    }
    setIsProcessing(false);
  };

  const retryImage = async (img: GeneratedImage) => {
    if (isProcessing) return;
    setIsProcessing(true);
    await generateOne(img.id, img.prompt);
    setIsProcessing(false);
  };

  const retryAllErrors = async () => {
    if (isProcessing) return;
    const errorImages = images.filter(img => img.status === 'error');
    if (errorImages.length === 0) return;

    setIsProcessing(true);
    setProgress(0);
    for (let i = 0; i < errorImages.length; i++) {
      await generateOne(errorImages[i].id, errorImages[i].prompt);
      setProgress(Math.round(((i + 1) / errorImages.length) * 100));
    }
    setIsProcessing(false);
  };

  const downloadAll = async () => {
    const completedImages = images.filter(img => img.status === 'completed' && img.url);
    if (completedImages.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder("ai86pro-exported-images");

    for (let i = 0; i < completedImages.length; i++) {
        const img = completedImages[i];
        try {
            const response = await fetch(img.url);
            const blob = await response.blob();
            folder?.file(`${img.id}-${i}.png`, blob);
        } catch (e) {
            console.error("Failed to download image for zip:", e);
        }
    }

    const zipContent = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipContent);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai86pro-images-${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const clearPrompts = () => setPrompts('');

  return (
    <div className="h-screen flex flex-col bg-dash-bg text-[#E0E0E0] overflow-hidden select-none">
      {/* Header */}
      <header className="h-14 border-b border-dash-border flex items-center justify-between px-6 bg-dash-header shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            A
          </div>
          <h1 className="text-lg font-semibold tracking-tighter uppercase whitespace-nowrap">
            AI86.PRO <span className="text-blue-500">Batch</span> Image Studio
          </h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            <span className={cn("w-2 h-2 rounded-full", isProcessing ? "bg-amber-500 animate-pulse" : "bg-green-500")}></span>
            {isProcessing ? `Processing Job: ${progress}%` : "System Ready: IDLE"}
          </div>
          <div className="flex items-center gap-3">
            <button className="px-3 py-1 bg-white/5 border border-white/10 rounded text-[10px] uppercase font-bold hover:bg-white/10 transition-colors">Documentation</button>
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-dash-border flex items-center justify-center overflow-hidden">
               <ImageIcon size={14} className="text-zinc-500" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Configuration & Input */}
        <aside className="w-80 border-r border-dash-border p-5 flex flex-col gap-6 bg-dash-panel shrink-0 overflow-hidden">
          <section className="shrink-0">
            <label className="tech-label">Model Selection</label>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs font-bold text-blue-400 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer transition-all hover:bg-white/10"
              >
                {MODELS.map(model => (
                  <option key={model.id} value={model.id} className="bg-dash-panel text-white py-2">
                    {model.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>
          </section>

          <section className="shrink-0 relative" ref={ratioRef}>
            <label className="tech-label">Aspect Ratio</label>
            <button
              onClick={() => setIsRatioOpen(!isRatioOpen)}
              className="w-full flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "border border-blue-500/50 w-5 h-5 flex items-center justify-center p-0.5",
                  selectedRatio === '1:1' ? "aspect-square" : 
                  selectedRatio === '16:9' ? "aspect-video" : 
                  selectedRatio === '9:16' ? "aspect-[9/16]" : "aspect-[4/3]"
                )}>
                  <div className="w-full h-full bg-blue-500/20" />
                </div>
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{selectedRatio}</span>
              </div>
              <ChevronDown size={14} className={cn("text-zinc-500 transition-transform duration-200", isRatioOpen ? "rotate-180" : "")} />
            </button>

            <AnimatePresence>
              {isRatioOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden"
                >
                  {RATIOS.map(ratio => (
                    <button
                      key={ratio.id}
                      onClick={() => {
                        setSelectedRatio(ratio.id);
                        setIsRatioOpen(false);
                      }}
                      className={cn(
                        "w-full p-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left",
                        selectedRatio === ratio.id ? "bg-blue-500/10 text-blue-400" : "text-zinc-400"
                      )}
                    >
                      <div className={cn(
                        "border border-current opacity-40",
                        ratio.id === '1:1' ? "w-3 h-3" : 
                        ratio.id === '16:9' ? "w-5 h-2.5" : 
                        ratio.id === '9:16' ? "w-2.5 h-4.5" : "w-4 h-3"
                      )} />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase">{ratio.id}</span>
                        <span className="text-[8px] text-zinc-600 font-mono tracking-tighter">{ratio.name}</span>
                      </div>
                      {selectedRatio === ratio.id && <div className="ml-auto w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section className="shrink-0 flex flex-col gap-3">
            <label className="tech-label">Reference Material</label>
            <div className="flex gap-2">
              <label className={cn(
                "flex-1 group cursor-pointer relative",
                styleRef ? "ring-2 ring-blue-500 rounded-xl" : ""
              )}>
                <input type="file" className="hidden" accept="image/*" onChange={handleStyleRefUpload} />
                <div className="flex flex-col items-center justify-center p-3 bg-white/5 border border-dashed border-white/10 rounded-xl hover:bg-white/10 transition-all min-h-[80px]">
                  {styleRef ? (
                    <>
                      <img src={styleRef} className="absolute inset-0 w-full h-full object-cover rounded-xl" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                        <Trash2 size={16} className="text-white" onClick={(e) => { e.preventDefault(); setStyleRef(null); }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <Palette size={18} className="text-zinc-600 group-hover:text-blue-500 mb-2" />
                      <span className="text-[9px] font-bold text-zinc-500 uppercase">Style</span>
                    </>
                  )}
                </div>
              </label>

              <label className={cn(
                "flex-1 group cursor-pointer relative",
                characterRef ? "ring-2 ring-blue-500 rounded-xl" : ""
              )}>
                <input type="file" className="hidden" accept="image/*" onChange={handleCharacterRefUpload} />
                <div className="flex flex-col items-center justify-center p-3 bg-white/5 border border-dashed border-white/10 rounded-xl hover:bg-white/10 transition-all min-h-[80px]">
                  {characterRef ? (
                    <>
                      <img src={characterRef} className="absolute inset-0 w-full h-full object-cover rounded-xl" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                        <Trash2 size={16} className="text-white" onClick={(e) => { e.preventDefault(); setCharacterRef(null); }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <User size={18} className="text-zinc-600 group-hover:text-blue-500 mb-2" />
                      <span className="text-[9px] font-bold text-zinc-500 uppercase">Character</span>
                    </>
                  )}
                </div>
              </label>
            </div>
            <p className="text-[8px] text-zinc-600 font-mono uppercase tracking-tighter">* Upload images to guide style and subject consistency</p>
          </section>

          {/* New Prompt Input (Replaced Latency) */}
          <section className="flex-1 min-h-0 flex flex-col bg-dash-bg border border-dash-border rounded-xl overflow-hidden shadow-inner">
            <div className="p-3 border-b border-dash-border bg-white/5 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-2">
                <Plus size={12} className="text-blue-500" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Pipeline Inbound</h2>
               </div>
               <button 
                 onClick={clearPrompts} 
                 className="text-[9px] font-bold px-2 py-1 bg-red-500/10 text-red-500 rounded border border-red-500/20 hover:bg-red-500/20 transition-colors uppercase"
               >Clear</button>
            </div>
            <textarea
              value={prompts}
              onChange={(e) => setPrompts(e.target.value)}
              placeholder="Inject prompts here (one per line)..."
              className="flex-1 w-full bg-transparent p-4 font-mono text-xs leading-relaxed text-blue-100 placeholder:text-zinc-800 focus:outline-none resize-none selection:bg-blue-900"
            />
            <div className="p-3 border-t border-dash-border bg-white/5 flex flex-col gap-2 shrink-0">
               <div {...getRootProps()} className="cursor-pointer group">
                  <input {...getInputProps()} />
                  <div className="w-full py-2 bg-white/5 border border-white/5 group-hover:border-blue-500/30 rounded-lg text-center transition-all">
                    <span className="text-[9px] font-bold text-zinc-500 group-hover:text-blue-400 uppercase tracking-widest flex items-center justify-center gap-2">
                      <Upload size={10} /> Bulk Import (.txt, .xlsx)
                    </span>
                  </div>
               </div>
               <button
                onClick={handleGenerate}
                disabled={isProcessing || !prompts.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold rounded-xl shadow-xl shadow-blue-900/40 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:scale-100 uppercase tracking-widest text-[11px]"
              >
                {isProcessing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                <span>{isProcessing ? `${progress}%` : "Run Pipeline"}</span>
              </button>
              
              <div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">Forecast Cost</span>
                  <span className="text-[14px] font-mono font-bold text-emerald-500">${totalPrice}</span>
                </div>
                <div className="text-[8px] text-zinc-600 font-mono text-right uppercase tracking-tighter">
                  {getActivePrompts().length} tasks × ${modelInfo?.price?.toFixed(3)}
                </div>
              </div>
            </div>
          </section>
        </aside>

        {/* Center: Main Display (Gallery) */}
        <div className="flex-1 flex flex-col bg-dash-bg relative overflow-hidden">
          <div className="p-4 border-b border-dash-border flex justify-between items-center bg-dash-header shrink-0">
             <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Observation Deck / Output Matrix</h2>
             </div>
             <div className="flex items-center gap-2">
                {images.some(img => img.status === 'error') && (
                  <button 
                    onClick={retryAllErrors}
                    disabled={isProcessing}
                    className="px-3 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[9px] uppercase font-bold flex items-center gap-2 hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    <RefreshCcw size={10} /> Retry All Errors
                  </button>
                )}
                {images.some(img => img.status === 'completed') && (
                  <button 
                    onClick={downloadAll}
                    className="px-3 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded text-[9px] uppercase font-bold flex items-center gap-2 hover:bg-blue-500/20 transition-all"
                  >
                    <Archive size={10} /> Download All (.zip)
                  </button>
                )}
                <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 ml-4">
                   <span>ACTIVE_STREAMS: {images.filter(i => i.status === 'processing').length}</span>
                   <span className="text-zinc-800">|</span>
                   <span>TOTAL_ASSETS: {images.length}</span>
                </div>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {images.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded-[3rem] m-4">
                 <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5 group">
                    <ImageIcon size={32} className="text-zinc-700 group-hover:text-blue-500 transition-colors" />
                 </div>
                 <p className="text-xs font-bold text-zinc-600 uppercase tracking-[0.2em] mb-2">No Visual Data Detected</p>
                 <p className="text-[10px] text-zinc-800 font-mono italic">Awaiting pipeline execution signals...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {images.map((img) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={img.id}
                      className="bg-dash-card border border-dash-border rounded-3xl overflow-hidden group flex flex-col shadow-2xl"
                    >
                      <div className="relative aspect-square bg-zinc-900/80 overflow-hidden">
                        {img.status === 'processing' && (
                          <div className="absolute inset-0 bg-dash-panel/60 backdrop-blur-md z-30 flex flex-col items-center justify-center p-8 text-center">
                             <div className="relative w-20 h-20 flex items-center justify-center">
                                <motion.div 
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                  className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full"
                                />
                                <div className="text-[10px] font-bold font-mono text-blue-400">SYNC</div>
                             </div>
                             <p className="mt-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Compiling Pixels</p>
                          </div>
                        )}

                        {img.status === 'error' && (
                          <div className="absolute inset-0 z-30 bg-red-900/10 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                             <XCircle size={32} className="text-red-500 mb-2" />
                             <p className="text-[10px] font-bold text-red-500 uppercase tracking-[0.2em]">Matrix Corruption</p>
                             <p className="text-[9px] text-red-400/60 font-mono mt-2 mb-4 line-clamp-2 uppercase">{img.error}</p>
                             <button 
                               onClick={() => retryImage(img)}
                               className="px-4 py-2 bg-red-500 text-white rounded-lg text-[10px] font-bold uppercase flex items-center gap-2 hover:bg-red-600 transition-colors"
                             >
                               <RefreshCcw size={12} /> Retry Node
                             </button>
                             <button 
                               onClick={() => removeImage(img.id)}
                               className="mt-2 text-[9px] text-zinc-500 hover:text-white uppercase font-bold transition-colors"
                             >
                               Discard
                             </button>
                          </div>
                        )}

                        {img.url ? (
                          <>
                            <img 
                              src={img.url} 
                              alt={img.prompt}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-dash-bg via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-6 flex flex-col justify-end gap-3 translate-y-4 group-hover:translate-y-0 transition-transform">
                               <div className="flex gap-2">
                                  <button 
                                    onClick={() => window.open(img.url, '_blank')}
                                    className="flex-1 bg-white hover:bg-zinc-200 text-black py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 transition-all shadow-xl"
                                  >
                                    <ExternalLink size={12} /> Inspect
                                  </button>
                                  <a 
                                    href={img.url}
                                    download={`export-${img.id}.png`}
                                    target="_blank"
                                    className="w-10 h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center justify-center transition-all shadow-xl"
                                  >
                                    <Download size={14} />
                                  </a>
                               </div>
                               <button 
                                 onClick={() => removeImage(img.id)}
                                 className="w-full py-2 bg-red-500/10 hover:bg-red-500/80 text-red-500 hover:text-white rounded-xl text-[10px] font-bold border border-red-500/20 transition-all uppercase"
                               >
                                  Evict from Cache
                               </button>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-800 gap-3">
                             <ImageIcon size={40} className="opacity-20" />
                             <span className="text-[9px] font-mono uppercase tracking-[0.3em] opacity-40">Ready_To_Stream</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="p-5 border-t border-dash-border">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] font-medium leading-relaxed text-zinc-500 italic line-clamp-2 group-hover:text-zinc-300 transition-colors">
                            &ldquo;{img.prompt}&rdquo;
                          </p>
                          <button 
                            onClick={() => navigator.clipboard.writeText(img.prompt)}
                            className="p-1.5 text-zinc-700 hover:text-blue-500 transition-colors bg-white/5 rounded-lg"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                        
                        <div className="mt-4 flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)]",
                                img.status === 'completed' ? "bg-green-500" :
                                img.status === 'error' ? "bg-red-500" : "bg-blue-500 animate-pulse"
                              )} />
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-widest",
                                img.status === 'completed' ? "text-green-500" :
                                img.status === 'error' ? "text-red-500" : "text-blue-500"
                              )}>{img.status === 'completed' ? 'Stream_Verified' : img.status}</span>
                           </div>
                           <div className="text-[9px] font-semibold text-zinc-600 bg-white/5 px-2 py-1 rounded-md font-mono">
                              {new Date(img.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Telemetry & Monitoring */}
        <aside className="w-80 border-l border-dash-border flex flex-col bg-dash-panel shrink-0 overflow-hidden">
          <div className="p-4 border-b border-dash-border bg-dash-panel shrink-0">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Live Telemetry Queue</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {images.length === 0 ? (
              <div className="h-full flex items-center justify-center grayscale opacity-10">
                <Settings2 size={40} />
              </div>
            ) : (
              images.map(img => (
                <div key={img.id} className="p-3 bg-dash-card border border-dash-border rounded-lg flex items-center gap-3 group">
                   <div className="w-10 h-10 bg-zinc-900 rounded overflow-hidden shrink-0 border border-white/5">
                      {img.url ? <img src={img.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center"><Loader2 size={12} className="animate-spin text-zinc-700" /></div>}
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold text-zinc-300 truncate tracking-tight mb-1">{img.prompt}</div>
                      <div className="flex items-center gap-2">
                         <span className={cn(
                           "text-[8px] font-bold uppercase",
                           img.status === 'completed' ? "text-green-500" : "text-blue-500"
                         )}>{img.status}</span>
                         <span className="text-[8px] text-zinc-600 font-mono tracking-tighter truncate opacity-40">0x{img.id.toUpperCase()}</span>
                      </div>
                   </div>
                   {img.status === 'completed' && <CheckCircle2 size={12} className="text-green-500 shrink-0" />}
                </div>
              ))
            )}
          </div>
          
          <div className="p-4 border-t border-dash-border bg-white/5 shrink-0">
             <div className="bg-blue-600/5 border border-blue-500/10 rounded-lg p-3">
               <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Network Latency</span>
                  <span className="text-[9px] font-mono text-blue-400">42ms</span>
               </div>
               <div className="h-4 flex items-end gap-0.5">
                  {[2, 5, 3, 8, 4, 6, 3, 7, 5, 9, 4, 3, 6, 8, 5, 7].map((h, i) => (
                    <motion.div 
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h * 10}%` }}
                      className="flex-1 bg-blue-500/40 rounded-t-[1px]"
                    />
                  ))}
               </div>
             </div>
          </div>
        </aside>
      </main>

      {/* Footer Status Bar */}
      <footer className="h-8 border-t border-dash-border px-6 bg-dash-header shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 tracking-tighter">
          <div className="flex items-center gap-1.5">
             <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
             <span className="uppercase">Internal Link: Active</span>
          </div>
          <span className="text-zinc-800">|</span>
          <span className="uppercase">Uptime: 99.9%</span>
          <span className="text-zinc-800">|</span>
          <span className="uppercase text-zinc-600">Buffer: 0.12ms</span>
        </div>
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest opacity-40">
           BK_ENGINE_PROD_04_STABLE
        </div>
      </footer>
    </div>
  );
}
