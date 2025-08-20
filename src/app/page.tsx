"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MultiSelect, Option } from "@/components/ui/multi-select";
import { db, SavedBackground } from "@/db";
import { cn } from "@/lib/utils";
import { useLiveQuery } from "dexie-react-hooks";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { File as FileIcon, Image as ImageIcon, ShieldCheck, UploadCloud, X } from "lucide-react";
import Image from "next/image";
import { PDFDocument } from "pdf-lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Rnd } from "react-rnd";
import { toast } from "sonner";

export default function ZipCleaner() {
  // Core state
  const [file, setFile] = useState<File | null>(null);
  const [zipFiles, setZipFiles] = useState<Option[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [hasPdfs, setHasPdfs] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [savedFilters, setSavedFilters] = useState<Record<string, string[]>>({});

  // Mockup feature state
  const [foregroundImage, setForegroundImage] = useState<string | null>(null);
  // NEW: track intrinsic size/aspect of the foreground image
  const [fgMeta, setFgMeta] = useState<{ w: number; h: number; aspect: number } | null>(null);

  const [mockups, setMockups] = useState<string[]>([]);
  const [rndStates, setRndStates] = useState<Record<string, { width: number; height: number; x: number; y: number }>>({});
  const [isStaging, setIsStaging] = useState<boolean>(false);
  const editorImageRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const [isShiftDown, setIsShiftDown] = useState(false);

  // Text Mockup State
  const [mockupText, setMockupText] = useState("Your Text Here");
  const [mockupFont] = useState("Arial");
  const [mockupColor] = useState("#000000");
  const [mockupFontSize] = useState(24);

  // Saved backgrounds state (now from Dexie)
  const savedBackgrounds = useLiveQuery(() => db.backgrounds.toArray(), []);
  const [selectedBackgrounds, setSelectedBackgrounds] = useState<SavedBackground[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const filters = localStorage.getItem("zip-cleaner-filters");
    if (filters) setSavedFilters(JSON.parse(filters));
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const droppedFile = acceptedFiles[0];
    setFile(droppedFile);
    toast.info(`File "${droppedFile.name}" selected`);

    try {
      const zip = await JSZip.loadAsync(droppedFile);
      const files = Object.keys(zip.files).map((fileName) => ({
        value: fileName,
        label: fileName,
      }));
      setZipFiles(files);
      setSelectedFiles([]);
      setHasPdfs(files.some((f) => f.value.toLowerCase().endsWith(".pdf")));

      const pngFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.png') && !f.dir);
      if (pngFile) {
        const blob = await pngFile.async('blob');
        const url = URL.createObjectURL(blob);
        setForegroundImage(url);

        // NEW: detect intrinsic width/height of the PNG once and store aspect
        await new Promise<void>((res) => {
          const im = new window.Image();
          im.onload = () => {
            setFgMeta({ w: im.naturalWidth, h: im.naturalHeight, aspect: im.naturalWidth / im.naturalHeight });
            res();
          };
          im.onerror = () => res(); // don't block flow if this fails
          im.src = url;
        });

        toast.success("Found a PNG image in the ZIP for mockups.");

        // Auto-select all backgrounds from Dexie
        const allDbBackgrounds = await db.backgrounds.toArray();
        setSelectedBackgrounds(allDbBackgrounds);
      } else {
        setForegroundImage(null);
        setFgMeta(null);
        setSelectedBackgrounds([]);
        setRndStates({});
      }
    } catch (error) {
      toast.error("Failed to read ZIP file.");
      console.error(error);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    multiple: false,
  });

  const handleBackgroundDrop = useCallback(async (acceptedFiles: File[], type: 'image' | 'text') => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const bgName = prompt("Enter a name for this background:");
      if (!bgName) {
        toast.info("Background not saved (name not provided).");
        return;
      }
      try {
        const newBg: SavedBackground = { name: bgName, dataUrl, type };
        const id = await db.backgrounds.add(newBg);
        toast.success(`Background "${bgName}" saved!`);
        // Automatically select it
        setSelectedBackgrounds(prev => [...prev, { ...newBg, id }]);
      } catch (error) {
        toast.error("Failed to save background to the database.");
        console.error(error);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps: getImgBgRootProps, getInputProps: getImgBgInputProps, isDragActive: isImgBgDragActive } = useDropzone({
    onDrop: (files) => handleBackgroundDrop(files, 'image'),
    accept: { "image/*": [".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"] },
    multiple: false,
  });

  const { getRootProps: getTextBgRootProps, getInputProps: getTextBgInputProps, isDragActive: isTextBgDragActive } = useDropzone({
    onDrop: (files) => handleBackgroundDrop(files, 'text'),
    accept: { "image/*": [".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"] },
    multiple: false,
  });

  const toggleSavedBackgroundSelection = (bgToToggle: SavedBackground) => {
    setSelectedBackgrounds(prevSelected => {
      const isSelected = prevSelected.some(bg => bg.id === bgToToggle.id);
      return isSelected ? prevSelected.filter(bg => bg.id !== bgToToggle.id) : [...prevSelected, bgToToggle];
    });
  };

  const deleteSavedBackground = async (idToDelete: number, name: string) => {
    try {
      await db.backgrounds.delete(idToDelete);
      toast.success(`Background "${name}" deleted.`);
    } catch (error) {
      toast.error("Failed to delete background.");
      console.error(error);
    }
  };

  const stageMockup = async () => {
    if (selectedBackgrounds.length === 0) {
      toast.error("Please select at least one background.");
      return;
    }
    setIsStaging(true);

    try {
      const newMockups: string[] = [];
      for (const bg of selectedBackgrounds) {
        if (!bg.id) continue;

        const canvas = document.createElement('canvas');
        const tempBgImage = new window.Image();
        tempBgImage.src = bg.dataUrl;

        await new Promise<void>((resolve, reject) => {
          tempBgImage.onload = () => {
            canvas.width = tempBgImage.naturalWidth;
            canvas.height = tempBgImage.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error("Canvas context not available."));
              return;
            }

            // Draw the background first
            ctx.drawImage(tempBgImage, 0, 0);

            const currentRndState = rndStates[bg.id!];
            const editorImg = editorImageRefs.current[bg.id!];

            if (!currentRndState || !editorImg) {
              console.warn(`Could not find RND state or editor image ref for background ${bg.id}`);
              resolve();
              return;
            }

            // Map editor CSS pixels to natural background pixels
            const editorDisplayW = editorImg.clientWidth;
            const editorDisplayH = editorImg.clientHeight || Math.round(
              editorDisplayW * (editorImg.naturalHeight / editorImg.naturalWidth)
            );

            const scaleX = tempBgImage.naturalWidth / editorDisplayW;
            const scaleY = tempBgImage.naturalHeight / editorDisplayH;

            if (bg.type === 'image' && foregroundImage) {
              const fgImage = new window.Image();
              fgImage.src = foregroundImage;
              fgImage.onload = () => {
                ctx.imageSmoothingEnabled = true;
                // @ts-ignore
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(
                  fgImage,
                  currentRndState.x * scaleX,
                  currentRndState.y * scaleY,
                  currentRndState.width * scaleX,
                  currentRndState.height * scaleY
                );
                newMockups.push(canvas.toDataURL('image/png'));
                resolve();
              };
              fgImage.onerror = () => reject(new Error("Failed to load foreground image."));
            } else if (bg.type === 'text') {
              // For text, scale dimensions appropriately (use min to keep uniform font proportions)
              const fontSize = mockupFontSize * Math.min(scaleX, scaleY);
              ctx.font = `${fontSize}px ${mockupFont}`;
              ctx.fillStyle = mockupColor;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const x = (currentRndState.x + currentRndState.width / 2) * scaleX;
              const y = (currentRndState.y + currentRndState.height / 2) * scaleY;

              // Handle user-defined newlines and word wrapping to the scaled width
              const userLines = mockupText.split('\n');
              const finalLines: string[] = [];
              const maxWidth = currentRndState.width * scaleX;

              for (const userLine of userLines) {
                let line = '';
                const words = userLine.split(' ');
                for (let n = 0; n < words.length; n++) {
                  const testLine = line + words[n] + ' ';
                  const metrics = ctx.measureText(testLine);
                  const testWidth = metrics.width;
                  if (testWidth > maxWidth && n > 0) {
                    finalLines.push(line);
                    line = words[n] + ' ';
                  } else {
                    line = testLine;
                  }
                }
                finalLines.push(line);
              }

              const lineHeight = fontSize * 1.2;
              const totalTextHeight = finalLines.length * lineHeight;
              const startY = y - totalTextHeight / 2 + lineHeight / 2;

              for (let i = 0; i < finalLines.length; i++) {
                ctx.fillText(finalLines[i].trim(), x, startY + (i * lineHeight));
              }

              newMockups.push(canvas.toDataURL('image/png'));
              resolve();
            } else {
              resolve();
            }
          };
          tempBgImage.onerror = () => reject(new Error("Failed to load background image."));
        });
      }
      setMockups(prev => [...prev, ...newMockups]);
      toast.success("Mockups staged successfully!");
    } catch (error: any) {
      toast.error(`Error staging mockups: ${error.message}`);
    } finally {
      setIsStaging(false);
    }
  };

  const removeStagedMockup = (indexToRemove: number) => {
    setMockups(prev => prev.filter((_, index) => index !== indexToRemove));
    toast.info("Staged mockup removed.");
  };

  const saveFilter = () => {
    const filterName = prompt("Enter a name for this filter:");
    if (filterName && selectedFiles.length > 0) {
      const extensionsOnly = selectedFiles.map((name) =>
        name.slice(name.lastIndexOf(".")).toLowerCase()
      );
      const unique = Array.from(new Set(extensionsOnly));
      const newFilters = { ...savedFilters, [filterName]: unique };
      setSavedFilters(newFilters);
      localStorage.setItem("zip-cleaner-filters", JSON.stringify(newFilters));
      toast.success(`Filter "${filterName}" saved!`);
    }
  };

  const applyFilter = (filterName: string) => {
    const filterExtensions = savedFilters[filterName];
    if (!filterExtensions || !zipFiles.length) return;

    const matchingFiles = zipFiles
      .filter((f) =>
        filterExtensions.includes(
          f.value.slice(f.value.lastIndexOf(".")).toLowerCase()
        )
      )
      .map((f) => f.value);

    setSelectedFiles(matchingFiles);
    toast.info(`Filter "${filterName}" applied.`);
  };

  const deleteFilter = (filterName: string) => {
    const newFilters = { ...savedFilters };
    delete newFilters[filterName];
    setSavedFilters(newFilters);
    localStorage.setItem("zip-cleaner-filters", JSON.stringify(newFilters));
    toast.success(`Filter "${filterName}" deleted.`);
  };

  const removeAll = () => {
    setSelectedFiles([]);
    toast.info("All selected files have been removed.");
  };

  const clearFile = () => {
    setFile(null);
    setZipFiles([]);
    setSelectedFiles([]);
    setHasPdfs(false);
    // Clear mockup state
    setForegroundImage(null);
    setFgMeta(null); // NEW
    setMockups([]);
    setSelectedBackgrounds([]);
    setRndStates({});
    toast.info("File and current mockup session cleared.");
  };

  const cleanZip = async () => {
    if (!file) {
      toast.error("Please upload a ZIP file first.");
      return;
    }

    const promise = async () => {
      const zip = await JSZip.loadAsync(file);
      const newZip = new JSZip();

      // 1. Clean the zip
      const cleaningPromises: Promise<void>[] = [];
      zip.forEach((relativePath, zipEntry) => {
        if (!selectedFiles.includes(zipEntry.name) && !zipEntry.dir) {
          cleaningPromises.push(
            zipEntry.async("blob").then((content) => {
              newZip.file(zipEntry.name, content);
            })
          );
        }
      });
      await Promise.all(cleaningPromises);

      const content = await newZip.generateAsync({ type: "blob" });
      saveAs(content, "cleaned.zip");
    };

    toast.promise(promise, {
      loading: "Cleaning ZIP...",
      success: "Cleaned ZIP downloaded!",
      error: "Error: Invalid ZIP file or cleaning failed.",
    });
  };

  const mergePdfs = async () => {
    if (!file) {
      toast.error("Please upload a ZIP file first.");
      return;
    }
    setIsMerging(true);

    const promise = async () => {
      const zip = await JSZip.loadAsync(file);
      const pdfFiles = zip.filter((_, file) => file.name.toLowerCase().endsWith(".pdf") && !file.dir);

      pdfFiles.sort((a, b) => {
        const numA = parseFloat(a.name.replace(/\.pdf$/i, ''));
        const numB = parseFloat(b.name.replace(/\.pdf$/i, ''));
        return numA - numB;
      });

      if (pdfFiles.length === 0) {
        throw new Error("No PDF files found in the ZIP.");
      }

      const mergedPdf = await PDFDocument.create();

      for (const pdfFile of pdfFiles) {
        const pdfBytes = await pdfFile.async("uint8array");
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([new Uint8Array(mergedPdfBytes)], { type: "application/pdf" });
      saveAs(blob, "merged.pdf");
    };

    toast.promise(promise, {
      loading: "Merging PDFs...",
      success: "PDFs merged and downloaded!",
      error: (err) => err.message,
      finally: () => setIsMerging(false),
    });
  };

  const downloadMockups = async () => {
    if (mockups.length === 0) {
      toast.error("No mockups staged to download.");
      return;
    }
    setIsProcessing(true);

    const promise = async () => {
      const newZip = new JSZip();
      const mockupFolder = newZip.folder("mockups");

      for (let i = 0; i < mockups.length; i++) {
        const response = await fetch(mockups[i]);
        const blob = await response.blob();
        mockupFolder?.file(`mockup_${i + 1}.png`, blob);
      }

      const content = await newZip.generateAsync({ type: "blob" });
      saveAs(content, "mockups.zip");
    };

    toast.promise(promise, {
      loading: "Preparing mockups...",
      success: "Mockups downloaded!",
      error: (err) => err.message || "An error occurred.",
      finally: () => setIsProcessing(false),
    });
  };

  const cleanMergeAndDownload = async () => {
    if (!file) {
      toast.error("Please upload a ZIP file first.");
      return;
    }
    setIsProcessing(true);

    const promise = async () => {
      const zip = await JSZip.loadAsync(file);
      const newZip = new JSZip();

      // 1. Clean the zip
      const cleaningPromises: Promise<void>[] = [];
      zip.forEach((relativePath, zipEntry) => {
        if (!selectedFiles.includes(zipEntry.name) && !zipEntry.dir) {
          cleaningPromises.push(
            zipEntry.async("blob").then((content) => {
              newZip.file(zipEntry.name, content);
            })
          );
        }
      });
      await Promise.all(cleaningPromises);

      // 2. Merge PDFs
      const pdfFiles = zip.filter((_, file) => file.name.toLowerCase().endsWith(".pdf") && !file.dir);
      if (pdfFiles.length > 0) {
        pdfFiles.sort((a, b) => {
          const numA = parseFloat(a.name.replace(/\.pdf$/i, ''));
          const numB = parseFloat(b.name.replace(/\.pdf$/i, ''));
          return numA - numB;
        });
        const mergedPdf = await PDFDocument.create();
        for (const pdfFile of pdfFiles) {
          const pdfBytes = await pdfFile.async("uint8array");
          const pdf = await PDFDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        const mergedPdfBytes = await mergedPdf.save();
        newZip.file("merged.pdf", mergedPdfBytes);
      }

      // 3. Add staged mockups
      if (mockups.length > 0) {
        const mockupFolder = newZip.folder("mockups");
        for (let i = 0; i < mockups.length; i++) {
          const response = await fetch(mockups[i]);
          const blob = await response.blob();
          mockupFolder?.file(`mockup_${i + 1}.png`, blob);
        }
      }

      // 4. Download the final zip
      const content = await newZip.generateAsync({ type: "blob" });
      saveAs(content, "cleaned_and_merged.zip");
    };

    toast.promise(promise, {
      loading: "Processing...",
      success: "ZIP file created and downloaded!",
      error: (err) => err.message || "An error occurred.",
      finally: () => setIsProcessing(false),
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-6">
      <Card className="w-full rounded-xl border border-gray-200 bg-white p-4 space-y-6">
        {/* HEADER */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-blue-800 md:text-4xl">
            ✨ ZIP Cleaner & Mockup Generator
          </h1>
          <p className="text-sm text-gray-500 md:text-base">
            Clean, merge PDFs, and create image mockups directly in your browser.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Left Column: Core Functionality */}
          <div className="flex-1 space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">📦 Core ZIP Functions</h2>

            {/* File Upload */}
            <div>
              {!file ? (
                <div
                  {...getRootProps()}
                  className={cn(
                    "flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200 hover:border-blue-400 hover:bg-blue-50",
                    isDragActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300 bg-white"
                  )}
                >
                  <input {...getInputProps()} />
                  <UploadCloud className="mx-auto h-12 w-12 text-blue-500" />
                  <p className="mt-3 text-sm text-gray-600">
                    {isDragActive
                      ? "Drop your ZIP here..."
                      : "Drag & drop a ZIP file here, or click to select one"}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">(Must contain files to clean/merge and optionally one PNG for mockups)</p>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-5 w-5 text-blue-600" />
                    <span className="truncate text-sm font-medium text-blue-900">
                      {file.name}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearFile} className="text-red-500 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* FILE SELECTOR */}
            {zipFiles.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <label className="text-base font-medium text-gray-700">
                    Select files to exclude from ZIP
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={removeAll}
                      disabled={selectedFiles.length === 0}
                      className="text-sm"
                    >
                      Remove All
                    </Button>
                    <Button
                      onClick={saveFilter}
                      disabled={selectedFiles.length === 0}
                      className="text-sm"
                    >
                      Save Filter
                    </Button>
                  </div>
                </div>
                <MultiSelect
                  options={zipFiles}
                  selected={selectedFiles}
                  onChange={setSelectedFiles}
                />
              </div>
            )}

            {/* SAVED FILTERS */}
            {Object.keys(savedFilters).length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-gray-700">💾 Saved Filters</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.keys(savedFilters).map((filterName) => (
                    <div
                      key={filterName}
                      className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm shadow-sm transition-all duration-200 hover:bg-gray-200"
                    >
                      <button
                        onClick={() => applyFilter(filterName)}
                        className="font-medium text-blue-700 hover:text-blue-800"
                      >
                        {filterName}
                      </button>
                      <button
                        onClick={() => deleteFilter(filterName)}
                        className="text-gray-500 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Mockup Generator */}
          <div className="flex-1 space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">🖼️ Mockup Generator</h2>

            {/* Background Uploaders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Image Background Uploader */}
              <div className="space-y-2">
                <label className="font-medium text-gray-700">1. Upload BG for Image</label>
                <div
                  {...getImgBgRootProps()}
                  className={cn(
                    "flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-all duration-200 hover:border-blue-400 hover:bg-blue-50",
                    isImgBgDragActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300 bg-white"
                  )}
                >
                  <input {...getImgBgInputProps()} />
                  <ImageIcon className="mx-auto h-8 w-8 text-blue-500" />
                  <p className="mt-2 text-sm text-gray-600">
                    {isImgBgDragActive
                      ? "Drop image here..."
                      : "Upload background for image mockups"}
                  </p>
                </div>
              </div>
              {/* Text Background Uploader */}
              <div className="space-y-2">
                <label className="font-medium text-gray-700">2. Upload BG for Text</label>
                <div
                  {...getTextBgRootProps()}
                  className={cn(
                    "flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-all duration-200 hover:border-green-400 hover:bg-green-50",
                    isTextBgDragActive
                      ? "border-green-500 bg-green-50"
                      : "border-gray-300 bg-white"
                  )}
                >
                  <input {...getTextBgInputProps()} />
                  <ImageIcon className="mx-auto h-8 w-8 text-green-500" />
                  <p className="mt-2 text-sm text-gray-600">
                    {isTextBgDragActive
                      ? "Drop image here..."
                      : "Upload background for text mockups"}
                  </p>
                </div>
              </div>
            </div>

            {/* Saved Backgrounds */}
            {savedBackgrounds && savedBackgrounds.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-700">Saved Backgrounds</h3>
                {/* Image Backgrounds */}
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-600">For Images</h4>
                  <div className="flex flex-wrap gap-3 p-2 border rounded-lg bg-gray-50">
                    {savedBackgrounds.filter(bg => bg.type === 'image').map((bg, index) => (
                      <div
                        key={bg.id}
                        className={cn(
                          "relative group border-2 rounded-md shadow-sm cursor-pointer w-24 h-24",
                          selectedBackgrounds.some(sbg => sbg.id === bg.id) ? "border-blue-500" : "border-gray-200"
                        )}
                        onClick={() => toggleSavedBackgroundSelection(bg)}
                      >
                        <Image
                          src={bg.dataUrl}
                          alt={bg.name || `Background ${index + 1}`}
                          layout="fill"
                          objectFit="cover"
                          className="rounded-md"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center truncate px-1 py-0.5 rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                          {bg.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSavedBackground(bg.id!, bg.name); }}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full size-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete background"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Text Backgrounds */}
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-600">For Text</h4>
                  <div className="flex flex-wrap gap-3 p-2 border rounded-lg bg-gray-50">
                    {savedBackgrounds.filter(bg => bg.type === 'text').map((bg, index) => (
                      <div
                        key={bg.id}
                        className={cn(
                          "relative group border-2 rounded-md shadow-sm cursor-pointer w-24 h-24",
                          selectedBackgrounds.some(sbg => sbg.id === bg.id) ? "border-green-500" : "border-gray-200"
                        )}
                        onClick={() => toggleSavedBackgroundSelection(bg)}
                      >
                        <Image
                          src={bg.dataUrl}
                          alt={bg.name || `Background ${index + 1}`}
                          layout="fill"
                          objectFit="cover"
                          className="rounded-md"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center truncate px-1 py-0.5 rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                          {bg.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSavedBackground(bg.id!, bg.name); }}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full size-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete background"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Editor */}
            {selectedBackgrounds.length > 0 && (foregroundImage || mockupText) && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-700">4. Position & Resize Foreground</h3>
                <div className="flex flex-wrap gap-4 justify-center">
                  {selectedBackgrounds.map((bg) => (
                    <div key={bg.id} className="relative border rounded-lg overflow-hidden max-w-sm w-full" style={{ minHeight: '200px' }}>
                      <img
                        ref={(el) => { editorImageRefs.current[bg.id!] = el; }}
                        src={bg.dataUrl}
                        alt={bg.name}
                        className="w-full h-auto"
                        onLoad={(e) => {
                          if (rndStates[bg.id!]) return; // already initialized

                          const img = e.currentTarget;

                          if (bg.type === 'text') {
                            // For text, default to full size
                            setRndStates(prev => ({
                              ...prev,
                              [bg.id!]: {
                                width: img.clientWidth,
                                height: img.clientHeight || Math.round(img.clientWidth * (img.naturalHeight / img.naturalWidth)),
                                x: 0,
                                y: 0,
                              }
                            }));
                          } else {
                            // Foreground IMAGE: fit a ratio-locked box inside 200x200, centered
                            const displayW = img.clientWidth;
                            const displayH = img.clientHeight || Math.round(displayW * (img.naturalHeight / img.naturalWidth));

                            const MAX = 200;
                            const maxW = Math.min(MAX, displayW);
                            const maxH = Math.min(MAX, displayH);

                            let initW = maxW;
                            let initH = maxH;

                            if (fgMeta) {
                              const scale = Math.min(maxW / fgMeta.w, maxH / fgMeta.h);
                              initW = Math.max(10, Math.round(fgMeta.w * scale));
                              initH = Math.max(10, Math.round(fgMeta.h * scale));
                            } else {
                              // Fallback if fgMeta not ready (rare)
                              const aspect = img.naturalWidth / img.naturalHeight;
                              initH = Math.round(initW / aspect);
                              if (initH > maxH) {
                                initH = maxH;
                                initW = Math.round(initH * aspect);
                              }
                            }

                            const x = Math.max(0, Math.round((displayW - initW) / 2));
                            const y = Math.max(0, Math.round((displayH - initH) / 2));

                            setRndStates(prev => ({
                              ...prev,
                              [bg.id!]: { width: initW, height: initH, x, y }
                            }));
                          }
                        }}
                      />
                      {rndStates[bg.id!] && (
                        <Rnd
                          size={{ width: rndStates[bg.id!].width, height: rndStates[bg.id!].height }}
                          position={{ x: rndStates[bg.id!].x, y: rndStates[bg.id!].y }}
                          onDragStop={(e, d) => setRndStates(prev => ({ ...prev, [bg.id!]: { ...prev[bg.id!], x: d.x, y: d.y } }))}
                          // NEW: lock to foreground aspect unless Shift is held
                          lockAspectRatio={bg.type === 'image' && fgMeta ? (isShiftDown ? false : fgMeta.aspect) : false}
                          onResizeStop={(e, direction, ref, delta, position) => {
                            setRndStates(prev => ({
                              ...prev,
                              [bg.id!]: {
                                width: parseInt(ref.style.width, 10),
                                height: parseInt(ref.style.height, 10),
                                ...position,
                              }
                            }));
                          }}
                          bounds="parent"
                          cancel=".editable-text"
                          resizeHandleClasses={{
                            bottom: "rnd-handle-bottom",
                            bottomLeft: "rnd-handle-bottom-left",
                            bottomRight: "rnd-handle-bottom-right",
                            left: "rnd-handle-left",
                            right: "rnd-handle-right",
                            top: "rnd-handle-top",
                            topLeft: "rnd-handle-top-left",
                            topRight: "rnd-handle-top-right",
                          }}
                          style={{ border: "1px dashed #007bff", boxSizing: "border-box" }}
                        >
                          {bg.type === 'image' && foregroundImage ? (
                            <img src={foregroundImage} alt="Foreground" className="w-full h-full pointer-events-none" />
                          ) : bg.type === 'text' ? (
                            <div
                              className="editable-text"
                              contentEditable={true}
                              suppressContentEditableWarning={true}
                              onInput={(e) => setMockupText(e.currentTarget.textContent || "")}
                              style={{
                                color: mockupColor,
                                fontSize: `${mockupFontSize}px`,
                                fontFamily: mockupFont,
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                                outline: 'none',
                              }}
                            >
                              {mockupText}
                            </div>
                          ) : null}
                        </Rnd>
                      )}
                    </div>
                  ))}
                </div>
                <Button onClick={stageMockup} disabled={!selectedBackgrounds || selectedBackgrounds.length === 0 || isStaging}>
                  {isStaging ? "Staging..." : "Add All to Staged Mockups"}
                </Button>
              </div>
            )}

            {/* Staged Mockups */}
            {mockups.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-700">5. Staged Mockups</h3>
                <div className="flex flex-wrap gap-4 p-2 border rounded-lg bg-gray-50">
                  {mockups.map((mockup, index) => (
                    <div key={index} className="relative group w-24 h-24">
                      <Image
                        src={mockup}
                        alt={`Mockup ${index + 1}`}
                        layout="fill"
                        objectFit="cover"
                        className="border rounded-md shadow-sm"
                      />
                      <button
                        onClick={() => removeStagedMockup(index)}
                        className="absolute top-0 right-0 bg-red-500 text-white rounded-full size-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove mockup"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ACTIONS - Spanning both columns */}
        <div className="flex flex-col items-center gap-4 pt-4 border-t">
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              className="px-6 py-3 text-base font-semibold tracking-wide"
              size="lg"
              onClick={cleanZip}
              disabled={!file || isProcessing}
            >
              🚀 Clean and Download ZIP
            </Button>
            <Button
              className="px-6 py-3 text-base font-semibold tracking-wide"
              size="lg"
              onClick={mergePdfs}
              disabled={!file || !hasPdfs || isMerging || isProcessing}
            >
              📄 Merge PDFs
            </Button>
            <Button
              className="px-6 py-3 text-base font-semibold tracking-wide"
              size="lg"
              onClick={downloadMockups}
              disabled={mockups.length === 0 || isProcessing}
            >
              🖼️ Download Mockups
            </Button>
            <Button
              className="px-6 py-3 text-base font-semibold tracking-wide"
              size="lg"
              onClick={cleanMergeAndDownload}
              disabled={!file || isProcessing}
            >
              ✨ Clean, Merge & Download All
            </Button>
          </div>
          <p className="text-muted-foreground flex items-center text-sm">
            <ShieldCheck className="mr-2 h-4 w-4 text-green-500" />
            100% private. No uploads. No servers.
          </p>
        </div>
      </Card>
    </div>
  );
}
