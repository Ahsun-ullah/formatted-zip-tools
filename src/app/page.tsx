"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MultiSelect, Option } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { File as FileIcon, ShieldCheck, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

export default function ZipCleaner() {
  const [file, setFile] = useState<File | null>(null);
  const [zipFiles, setZipFiles] = useState<Option[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [savedFilters, setSavedFilters] = useState<Record<string, string[]>>(
    {}
  );

  useEffect(() => {
    const filters = localStorage.getItem("zip-cleaner-filters");
    if (filters) {
      setSavedFilters(JSON.parse(filters));
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
    toast.info("File cleared.");
  };

  const cleanZip = async () => {
    if (!file) {
      toast.error("Please upload a ZIP file first.");
      return;
    }

    const promise = async () => {
      const zip = await JSZip.loadAsync(file);
      const newZip = new JSZip();

      const promises: Promise<void>[] = [];
      zip.forEach((relativePath, zipEntry) => {
        if (!selectedFiles.includes(zipEntry.name)) {
          promises.push(
            zipEntry.async("blob").then((content) => {
              newZip.file(zipEntry.name, content);
            })
          );
        }
      });

      await Promise.all(promises);

      const content = await newZip.generateAsync({ type: "blob" });
      saveAs(content, "cleaned.zip");
    };

    toast.promise(promise, {
      loading: "Processing...",
      success: "Downloaded!",
      error: "Error: Invalid ZIP file or processing failed.",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-6">
      <Card className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl md:p-8 lg:p-10">
        {/* HEADER */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-800 md:text-4xl">
            ✨ ZIP Cleaner
          </h1>
          <p className="text-sm text-gray-500 md:text-base">
            Smart, fast, and 100% private. Clean ZIP files directly in your
            browser.
          </p>
        </div>

        {/* FILE UPLOAD */}
        <div className="py-6">
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
              <p className="mt-1 text-xs text-gray-400">(Max file size: 500MB)</p>
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

        {/* ACTIONS */}
        <div className="mt-6 flex flex-col items-center gap-4">
          <Button
            className="w-full px-6 py-3 text-base font-semibold tracking-wide sm:w-auto"
            size="lg"
            onClick={cleanZip}
            disabled={!file}
          >
            🚀 Clean and Download ZIP
          </Button>
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
                Select files to exclude
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
