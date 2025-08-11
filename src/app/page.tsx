"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MultiSelect, Option } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { File as FileIcon, Image as ImageIcon, ShieldCheck, UploadCloud, X } from "lucide-react";
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
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [foregroundImage, setForegroundImage] = useState<string | null>(null);
  const [mockups, setMockups] = useState<string[]>([]);
  const [rndState, setRndState] = useState({
    width: 200,
    height: 200,
    x: 50,
    y: 50,
  });
  const bgRef = useRef<HTMLImageElement>(null);

  // Saved backgrounds state
  const [savedBackgrounds, setSavedBackgrounds] = useState<{ name: string; dataUrl: string }[]>([]);

  useEffect(() => {
    const filters = localStorage.getItem("zip-cleaner-filters");
    if (filters) {
      setSavedFilters(JSON.parse(filters));
    }
    const backgrounds = localStorage.getItem("zip-cleaner-backgrounds");
    if (backgrounds) {
      setSavedBackgrounds(JSON.parse(backgrounds));
    }
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
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

        // Find and set foreground image for mockup
        const pngFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.png') && !f.dir);
        if (pngFile) {
          const blob = await pngFile.async('blob');
          setForegroundImage(URL.createObjectURL(blob));
          toast.success("Found a PNG image in the ZIP for mockups.");
          // Reset Rnd state for new foreground image
          setRndState({ width: 200, height: 200, x: 50, y: 50 });
        } else {
          setForegroundImage(null);
        }

      } catch (error) {
        toast.error("Failed to read ZIP file.");
        console.error(error);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    multiple: false,
  });

  const handleBackgroundDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setBackgroundImage(dataUrl);
        toast.info("Background image loaded.");

        const bgName = prompt("Enter a name for this background (optional):");
        if (bgName) {
          const newSavedBackgrounds = [...savedBackgrounds, { name: bgName, dataUrl }];
          setSavedBackgrounds(newSavedBackgrounds);
          localStorage.setItem("zip-cleaner-backgrounds", JSON.stringify(newSavedBackgrounds));
          toast.success(`Background "${bgName}" saved!`);
        }
      };
      reader.readAsDataURL(file);
    }
  }, [savedBackgrounds]);

  const { getRootProps: getBgRootProps, getInputProps: getBgInputProps, isDragActive: isBgDragActive } = useDropzone({
    onDrop: handleBackgroundDrop,
    accept: { "image/*": [".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"] },
    multiple: false,
  });

  const selectSavedBackground = (dataUrl: string) => {
    setBackgroundImage(dataUrl);
    toast.info("Saved background selected.");
  };

  const deleteSavedBackground = (name: string) => {
    const newSavedBackgrounds = savedBackgrounds.filter(bg => bg.name !== name);
    setSavedBackgrounds(newSavedBackgrounds);
    localStorage.setItem("zip-cleaner-backgrounds", JSON.stringify(newSavedBackgrounds));
    toast.success(`Background "${name}" deleted.`);
  };

  const stageMockup = () => {
    if (!backgroundImage || !foregroundImage || !bgRef.current) return;

    const canvas = document.createElement('canvas');
    const bgImage = bgRef.current;

    // Create a temporary image to get natural dimensions of the background
    const tempBgImage = new Image();
    tempBgImage.src = backgroundImage;
    tempBgImage.onload = () => {
      canvas.width = tempBgImage.naturalWidth;
      canvas.height = tempBgImage.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        toast.error("Could not create canvas context.");
        return;
      }

      const fgImage = new Image();
      fgImage.src = foregroundImage;
      fgImage.onload = () => {
        ctx.drawImage(tempBgImage, 0, 0);

        // Calculate scaling factor based on displayed size vs natural size
        const scaleX = tempBgImage.naturalWidth / bgImage.clientWidth;
        const scaleY = tempBgImage.naturalHeight / bgImage.clientHeight;

        ctx.drawImage(
          fgImage,
          rndState.x * scaleX,
          rndState.y * scaleY,
          rndState.width * scaleX,
          rndState.height * scaleY
        );
        const dataUrl = canvas.toDataURL('image/png');
        setMockups(prev => [...prev, dataUrl]);
        toast.success("Mockup staged successfully!");
      };
    };
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
    setBackgroundImage(null);
    setForegroundImage(null);
    setMockups([]);
    // Do NOT clear savedBackgrounds here, as they are persistent
    toast.info("File and current mockup session cleared.");
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
      <Card className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-4 space-y-6">
        {/* HEADER */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-blue-800 md:text-4xl">
            ✨ ZIP Cleaner & Mockup Generator
          </h1>
          <p className="text-sm text-gray-500 md:text-base">
            Clean, merge PDFs, and create image mockups directly in your browser.
          </p>
        </div>

        {/* FILE UPLOAD */}
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
        
        {/* MOCKUP SECTION */}
        <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">🖼️ Mockup Generator</h2>
            
            {/* Background Uploader */}
            <div className="space-y-2">
                <label className="font-medium text-gray-700">1. Upload or Select Background Image</label>
                <div
                  {...getBgRootProps()}
                  className={cn(
                    "flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-all duration-200 hover:border-blue-400 hover:bg-blue-50",
                    isBgDragActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300 bg-white"
                  )}
                >
                  <input {...getBgInputProps()} />
                  <ImageIcon className="mx-auto h-8 w-8 text-blue-500" />
                  <p className="mt-2 text-sm text-gray-600">
                    {isBgDragActive
                      ? "Drop your image here..."
                      : "Drag & drop a background image, or click to select one"}
                  </p>
                </div>
            </div>

            {/* Saved Backgrounds */}
            {savedBackgrounds.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-700">Saved Backgrounds</h3>
                <div className="flex flex-wrap gap-3 p-2 border rounded-lg bg-gray-50">
                  {savedBackgrounds.map((bg, index) => (
                    <div key={index} className="relative group">
                      <img 
                        src={bg.dataUrl} 
                        alt={bg.name || `Background ${index + 1}`} 
                        className="w-24 h-24 object-cover border rounded-md shadow-sm cursor-pointer"
                        onClick={() => selectSavedBackground(bg.dataUrl)}
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center truncate px-1 py-0.5 rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                        {bg.name}
                      </span>
                      <button
                        onClick={() => deleteSavedBackground(bg.name)}
                        className="absolute top-0 right-0 bg-red-500 text-white rounded-full size-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete background"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Editor */}
            {backgroundImage && foregroundImage && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-700">2. Position & Resize Foreground</h3>
                <div className="relative w-full border rounded-lg overflow-hidden" style={{ minHeight: '300px' }}>
                  <img ref={bgRef} src={backgroundImage} alt="Background" className="w-full h-auto" />
                  <Rnd
                    size={{ width: rndState.width, height: rndState.height }}
                    position={{ x: rndState.x, y: rndState.y }}
                    onDragStop={(e, d) => setRndState(prev => ({ ...prev, x: d.x, y: d.y }))}
                    onResizeStop={(e, direction, ref, delta, position) => {
                      setRndState({
                        width: parseInt(ref.style.width),
                        height: parseInt(ref.style.height),
                        ...position,
                      });
                    }}
                    bounds="parent"
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
                    style={{
                      border: "1px dashed #007bff",
                      boxSizing: "border-box",
                    }}
                  >
                    <img src={foregroundImage} alt="Foreground" className="w-full h-full pointer-events-none" />
                  </Rnd>
                </div>
                <Button onClick={stageMockup} disabled={!backgroundImage || !foregroundImage}>
                  Add to Staged Mockups
                </Button>
              </div>
            )}

            {/* Staged Mockups */}
            {mockups.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-700">3. Staged Mockups</h3>
                <div className="flex flex-wrap gap-4 p-2 border rounded-lg bg-gray-50">
                  {mockups.map((mockup, index) => (
                    <div key={index} className="relative group">
                      <img 
                        src={mockup} 
                        alt={`Mockup ${index + 1}`} 
                        className="w-24 h-24 object-cover border rounded-md shadow-sm"
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


        {/* ACTIONS */}
        <div className="flex flex-col items-center gap-4 pt-4 border-t">
          <div className="flex flex-wrap justify-center gap-4">
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

        {/* FILE SELECTOR */}
        {zipFiles.length > 0 && (
          <div className="mt-8 space-y-4">
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
          <div className="mt-8 space-y-3">
            <h3 className="text-base font-semibold text-gray-700">
              💾 Saved Filters
            </h3>
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
      </Card>
    </div>
  );
}
