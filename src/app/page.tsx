'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileJson } from 'lucide-react';
import Header from '@/components/Header';

type ProcessingState = 'ready' | 'processing' | 'complete' | 'error';

const PROCESSING_STAGES = [
  'Validating inputs structure...',
  'Extracting data from records...',
  'Running entity resolution...',
  'Auditing...',
  'Identifying gaps...',
  'Synthesizing...',
];

const SAMPLE_JSON = [
  {
    "date": "2024-01-15",
    "record_id": "PSY-2024-001",
    "provider": "Dr. Jane Smith, MD",
    "record_type": "Initial Psychiatric Evaluation",
    "diagnoses": ["Major Depressive Disorder, Recurrent, Severe", "Generalized Anxiety Disorder"],
    "medications": ["Sertraline 100mg daily", "Lorazepam 0.5mg PRN"],
    "chief_complaint": "Patient reports worsening depression and anxiety symptoms over past 3 months",
    "mental_status": "Alert and oriented x3. Depressed affect. Denies SI/HI.",
    "treatment_plan": "Continue current medications. Weekly therapy. Follow-up in 2 weeks.",
    "safety_assessment": "Low acute risk. No current suicidal ideation. Patient has safety plan."
  },
  {
    "date": "2024-01-29",
    "record_id": "PSY-2024-002",
    "provider": "Dr. Jane Smith, MD",
    "record_type": "Follow-up Visit",
    "diagnoses": ["Major Depressive Disorder, Recurrent, Severe"],
    "medications": ["Sertraline 150mg daily (increased)", "Lorazepam 0.5mg PRN"],
    "chief_complaint": "No improvement in symptoms despite compliance with treatment",
    "mental_status": "Tearful during session. Reports increased hopelessness.",
    "treatment_plan": "Increase Sertraline to 150mg. Consider adjunct therapy if no improvement.",
    "safety_assessment": "Moderate risk. Passive suicidal ideation without plan or intent."
  },
  {
    "date": "2024-02-15",
    "record_id": "PSY-2024-003",
    "provider": "Dr. Jane Smith, MD",
    "record_type": "Crisis Evaluation",
    "diagnoses": ["Major Depressive Disorder, Recurrent, Severe with Psychotic Features"],
    "medications": ["Sertraline 150mg daily", "Risperidone 2mg daily (added)", "Lorazepam 0.5mg PRN"],
    "chief_complaint": "Family brought patient in due to increasing isolation and auditory hallucinations",
    "mental_status": "Disheveled appearance. Flat affect. Responds to internal stimuli. Reports voices telling them they're worthless.",
    "treatment_plan": "Start Risperidone. Daily check-ins. Consider partial hospitalization program.",
    "safety_assessment": "High risk. Active suicidal ideation with plan. Contract for safety signed. Emergency contact provided."
  }
];

export default function ForensicDiscovery() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [state, setState] = useState<ProcessingState>('ready');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);
  const [recordCount, setRecordCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [availablePipelines, setAvailablePipelines] = useState<Array<{id: string; name: string}>>([]);
  const [selectedPipeline, setSelectedPipeline] = useState('medical_chronology'); // Default to Medical Chronology
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useHybridMode, setUseHybridMode] = useState(false);

  // Fetch available pipelines on mount
  useEffect(() => {
    const fetchPipelines = async () => {
      try {
        const response = await fetch('http://localhost:8001/pipelines');
        const data = await response.json();
        if (data.pipelines && data.pipelines.length > 0) {
          setAvailablePipelines(data.pipelines);
          // Keep medical_chronology as default (don't override with first item)
          // Only set if current selection doesn't exist in loaded pipelines
          const currentExists = data.pipelines.some((p: {id: string}) => p.id === 'medical_chronology');
          if (!currentExists && data.pipelines.length > 0) {
            setSelectedPipeline(data.pipelines[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load pipelines:', err);
      }
    };
    fetchPipelines();
  }, []);

  // Check backend status on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('http://localhost:8001/', {
          signal: AbortSignal.timeout(5000), // Increased to 5 seconds
          mode: 'cors'
        });
        if (response.ok) {
          setBackendStatus('online');
        } else {
          console.error('Backend returned non-OK status:', response.status);
          setBackendStatus('offline');
        }
      } catch (error) {
        // Silently handle timeout errors during processing - backend is likely busy
        if (error instanceof Error && error.name === 'TimeoutError') {
          // Don't change status during timeout - backend is probably processing
          return;
        }
        console.error('Backend health check failed:', error);
        setBackendStatus('offline');
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  // Simulate processing stages
  useEffect(() => {
    if (state === 'processing') {
      const stageInterval = setInterval(() => {
        setCurrentStage((prev) => {
          if (prev < PROCESSING_STAGES.length - 1) {
            setProgress(((prev + 1) / PROCESSING_STAGES.length) * 100);
            return prev + 1;
          }
          return prev;
        });
      }, 1200);
      return () => clearInterval(stageInterval);
    }
  }, [state]);

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setError('Please select a JSON file');
      return;
    }
    setSelectedFile(file);
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setState('processing');
    setProgress(0);
    setCurrentStage(0);
    setError(null);

    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);
      const recordsArray = Array.isArray(data) ? data : [data];
      setRecordCount(recordsArray.length);

      // Wait for processing animation to complete
      await new Promise(resolve => setTimeout(resolve, PROCESSING_STAGES.length * 1200));

      const response = await fetch('http://localhost:8001/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: recordsArray,
          pipeline: selectedPipeline,
          customer_name: customerName || 'Confidential Client',
          customer_email: customerEmail || '',
          hybrid_mode: useHybridMode
        }),
        signal: AbortSignal.timeout(120000), // 2 minute timeout for processing
      });

      if (!response.ok) throw new Error('Processing failed');

      const result = await response.json();

      // Store case ID for linking to admin
      if (result.case_id) {
        setCaseId(result.case_id);
      }

      if (result.status === 'error') {
        throw new Error(result.error);
      }

      setState('complete');
      setProgress(100);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
    }
  };

  const downloadSample = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-forensic-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-[var(--font-geist-sans)]">
      {/* Header */}
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Intake Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2 text-gray-900">Upload Case File</h2>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">System Status</span>
                <div className="relative">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      backendStatus === 'online'
                        ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                        : backendStatus === 'offline'
                        ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                        : 'bg-gray-400'
                    }`}
                  ></div>
                  {backendStatus === 'online' && (
                    <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-green-500 animate-ping opacity-75"></div>
                  )}
                </div>
                <span className="text-xs text-gray-500 font-[var(--font-geist-mono)]">
                  {backendStatus === 'checking' ? 'Checking...' : backendStatus === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Analysis Package Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-gray-700">
              Select Package
            </label>
            <select
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              disabled={state === 'processing'}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {availablePipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced Options */}
          <div className="mb-6">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-2"
              disabled={state === 'processing'}
            >
              <span>{showAdvanced ? '▼' : '▶'}</span>
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                <label className="flex items-start gap-3 text-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useHybridMode}
                    onChange={(e) => setUseHybridMode(e.target.checked)}
                    disabled={state === 'processing'}
                    className="mt-1 h-4 w-4 rounded border-gray-300 bg-white text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div>
                    <div className="font-medium">Enable Multi-Model Mode</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Uses GPT-4o-mini for data extraction and Claude Sonnet 4 for data analysis.
                    </div>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Customer Information */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Customer Name <span className="text-gray-500">(Optional)</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="John Smith, Esq."
                disabled={state === 'processing'}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Customer Email <span className="text-gray-500">(Optional)</span>
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="john@smithlaw.com"
                disabled={state === 'processing'}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-12 py-6 transition-all bg-white ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : state === 'ready' || state === 'complete'
                ? 'border-gray-300 hover:border-gray-400'
                : 'border-gray-200'
            } ${state === 'processing' ? 'pointer-events-none' : ''}`}
          >
            <div className="flex flex-col items-center gap-4">
              {state === 'ready' && (
                <>
                  <FileJson className="h-12 w-12 text-gray-400" />
                  <div className="text-center">
                    <p className="text-lg mb-1 text-gray-900">Drop your case file here</p>
                    <p className="text-sm text-gray-500">or click to browse</p>
                  </div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    className="hidden"
                    id="file-input"
                  />
                  <label
                    htmlFor="file-input"
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors font-medium text-sm"
                  >
                    Select File
                  </label>
                  {selectedFile && (
                    <div className="mt-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-[var(--font-geist-mono)] text-blue-700">
                        {selectedFile.name}
                      </p>
                    </div>
                  )}
                </>
              )}

              {state === 'processing' && (
                <div className="w-full max-w-md">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
                    <div>
                      <p className="font-medium text-gray-900">Analyzing {recordCount} records</p>
                      <p className="text-sm text-gray-600 font-[var(--font-geist-mono)]">
                        {PROCESSING_STAGES[currentStage]}
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {state === 'complete' && (
                <div className="text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-1 text-gray-900">Analysis Complete</p>
                  <p className="text-sm text-gray-600 mb-4">
                    {recordCount} record{recordCount !== 1 ? 's' : ''} analyzed
                  </p>
                  {caseId && (
                    <a
                      href={`/admin/review/${caseId}`}
                      className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm mb-3"
                    >
                      Review Case Details →
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setState('ready');
                      setSelectedFile(null);
                      setRecordCount(0);
                      setCaseId(null);
                    }}
                    className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm block mx-auto text-gray-700"
                  >
                    Analyze Another File
                  </button>
                </div>
              )}

              {state === 'error' && (
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-1 text-gray-900">Analysis Failed</p>
                  <p className="text-sm text-red-600">{error}</p>
                  <button
                    onClick={() => {
                      setState('ready');
                      setError(null);
                    }}
                    className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-700"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>

          {selectedFile && state === 'ready' && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleUpload}
                disabled={backendStatus !== 'online'}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                <Upload className="h-5 w-5" />
                Upload & Analyze
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-gray-600">
          <p>ChronoScope - Medical Chronologies</p>
          <p className="mt-1 font-[var(--font-geist-mono)] text-xs text-gray-500">
            PageWise™ • Powered by DocETL
          </p>
        </div>
      </footer>
    </div>
  );
}
