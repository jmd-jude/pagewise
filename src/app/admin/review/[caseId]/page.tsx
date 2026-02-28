'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  Search,
  AlertCircle,
  FileText,
  ArrowLeft,
  Clock,
  AlertTriangle,
  Activity,
  User,
  MessageCircle,
  Download,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { getPipelineName } from '@/lib/pipelines';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Case {
  id: string;
  customer_name: string;
  pipeline: string;
  records_count: number;
  uploaded_at: string;
  status: string;
  analysis: Record<string, any>;
  edits?: Record<string, any>;
  comments?: { [section: string]: { [index: number]: string } };
  original_records?: any[];
}

interface StructuredContradiction {
  description: string;
  records: string[];
  category?: string;
  severity?: 'critical' | 'moderate' | 'minor';
  legal_relevance: 'high' | 'medium' | 'low';
}

interface StructuredRedFlag {
  category: string;
  issue: string;
  records: string[];
  legal_relevance: 'high' | 'medium' | 'low';
}

interface StructuredExpertOpinion {
  topic: string;
  records: string[];
  reason: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function isStructuredArray(arr: any[]): boolean {
  return arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null;
}

function getLegalRelevanceBadgeColor(relevance: string): string {
  switch (relevance?.toLowerCase()) {
    case 'high':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'medium':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'low':
      return 'bg-green-100 text-green-800 border-green-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getSeverityBadgeColor(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'moderate':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'minor':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function extractRecordIds(text: string): { cleanText: string; recordIds: string[] } {
  const recordIdPattern = /\[([A-Z]{2,}-\d{4}-\d+)\]/g;
  const recordIds: string[] = [];
  let match;

  while ((match = recordIdPattern.exec(text)) !== null) {
    recordIds.push(match[1]);
  }

  // Remove record IDs from text for cleaner display
  const cleanText = text.replace(recordIdPattern, '').trim();

  return { cleanText, recordIds };
}

// ============================================================================
// SOURCE PANEL COMPONENT
// ============================================================================

interface SourcePanelProps {
  records: any[];
  onClose: () => void;
  formatKey: (key: string) => string;
  formatValue: (value: any) => string;
}

// Strip the 1–25 line-number column that docling preserves from deposition page margins.
// Those lines are purely numeric and appear before the actual transcript text.
function stripTranscriptLineNumbers(content: string): string {
  const lines = content.split('\n');
  let firstContentIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() && !/^\d+$/.test(lines[i].trim())) {
      firstContentIdx = i;
      break;
    }
  }
  return lines.slice(firstContentIdx).join('\n').trim();
}

const SourcePanel = ({ records, onClose, formatKey, formatValue }: SourcePanelProps) => {
  const isTranscriptRecord = (record: any) => record.doc_id === 'transcript' && record.content;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex items-center justify-between z-10 shadow-md">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Source Records ({records.length})
        </h3>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-200 text-2xl font-bold leading-none"
          title="Close panel"
        >
          ×
        </button>
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {records.map((record, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            {/* Record Header */}
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <code className="text-sm font-semibold text-blue-700">
                {record.record_id || record.id || 'Unknown'}
              </code>
              {record.page_num && (
                <span className="text-xs text-gray-500 font-medium">Page {record.page_num}</span>
              )}
            </div>

            {/* Record Content */}
            <div className="p-3 bg-white text-sm">
              {isTranscriptRecord(record) ? (
                // Transcript-specific rendering: strip line numbers, show as readable dialogue
                <div className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap font-mono bg-gray-50 rounded p-2 border border-gray-100">
                  {stripTranscriptLineNumbers(record.content)}
                </div>
              ) : (
                // Generic rendering for non-transcript records
                <div className="space-y-3">
                  {Object.entries(record).map(([key, value]) => (
                    <div key={key}>
                      <div className="font-semibold text-gray-700 text-xs uppercase tracking-wide">
                        {formatKey(key)}:
                      </div>
                      <div className="text-gray-900 whitespace-pre-wrap break-words mt-1">
                        {formatValue(value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EnhancedCaseReview() {
  const params = useParams();
  const caseId = params.caseId as string;

  const [case_, setCase] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLegalRelevance, setSelectedLegalRelevance] = useState<Set<string>>(
    new Set(['high', 'medium', 'low'])
  );
  const [comments, setComments] = useState<{ [section: string]: { [index: number]: string } }>({});
  const [commentModalData, setCommentModalData] = useState<{section: string, index: number, currentComment: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Source Panel state
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [sourcePanelRecords, setSourcePanelRecords] = useState<any[]>([]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{role: string; content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    fetchCase();
  }, [caseId]);

  const fetchCase = async () => {
    try {
      const response = await fetch(`http://localhost:8001/admin/case/${caseId}`);
      const data = await response.json();

      if (data.status === 'success') {
        setCase(data.case);
        setComments(data.case.comments || {});
      } else {
        setError(data.error || 'Failed to load case');
      }
    } catch (err) {
      setError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  const saveComments = async () => {
    setSaving(true);
    setSaveMessage('');

    try {
      const response = await fetch('http://localhost:8001/admin/update-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: caseId,
          edits: case_?.edits || case_?.analysis,
          comments: comments,
        }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        setSaveMessage('Comments saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to save comments');
      }
    } catch (err) {
      setError('Failed to save comments');
    } finally {
      setSaving(false);
    }
  };

  const downloadPDF = () => {
    window.open(`http://localhost:8001/admin/export-pdf/${caseId}`, '_blank');
  };

  const getComment = (section: string, index: number): string => {
    return comments[section]?.[index] || '';
  };

  const hasComment = (section: string, index: number): boolean => {
    return !!comments[section]?.[index];
  };

  const openCommentModal = (section: string, index: number) => {
    const currentComment = getComment(section, index);
    setCommentModalData({ section, index, currentComment });
  };

  const saveComment = (section: string, index: number, comment: string) => {
    const newComments = { ...comments };
    if (!newComments[section]) {
      newComments[section] = {};
    }
    if (comment.trim()) {
      newComments[section][index] = comment;
    } else {
      // Remove comment if empty
      delete newComments[section][index];
      if (Object.keys(newComments[section]).length === 0) {
        delete newComments[section];
      }
    }
    setComments(newComments);
    setCommentModalData(null);
  };

  const openSourcePanel = (recordIds: string[]) => {
    if (!case_?.original_records) {
      alert('Original source records not available for this case');
      return;
    }

    const records = case_.original_records.filter((r: any) =>
      recordIds.includes(r.record_id || r.id)
    );

    if (records.length === 0) {
      alert(`No records found for IDs: ${recordIds.join(', ')}`);
      return;
    }

    setSourcePanelRecords(records);
    setSourcePanelOpen(true);
  };

  const formatKey = (key: string): string => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');

    // Add user message to history
    const newMessages = [...chatMessages, { role: 'user', content: userMessage }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const response = await fetch('http://localhost:8001/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: caseId,
          message: userMessage,
          history: chatMessages
        })
      });

      const data = await response.json();

      if (data.status === 'success') {
        setChatMessages([...newMessages, { role: 'assistant', content: data.response }]);
      } else {
        setChatMessages([...newMessages, {
          role: 'assistant',
          content: `Error: ${data.error}`
        }]);
      }
    } catch (err) {
      setChatMessages([...newMessages, {
        role: 'assistant',
        content: 'Failed to get response from server'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ============================================================================
  // FILTERING & SEARCH
  // ============================================================================

  const filteredSections = useMemo(() => {
    if (!case_?.analysis) return {};

    const filtered: Record<string, any[]> = {};
    const searchLower = searchTerm.toLowerCase();

    Object.entries(case_.analysis).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;

      let items = value;

      // Apply legal relevance filter if structured
      if (isStructuredArray(items)) {
        items = items.filter((item: any) => {
          const relevance = item.legal_relevance?.toLowerCase();
          return !relevance || selectedLegalRelevance.has(relevance);
        });
      }

      // Apply search filter
      if (searchTerm) {
        items = items.filter((item: any) => {
          const searchableText = typeof item === 'string' 
            ? item 
            : JSON.stringify(item);
          return searchableText.toLowerCase().includes(searchLower);
        });
      }

      if (items.length > 0) {
        filtered[key] = items;
      }
    });

    return filtered;
  }, [case_, searchTerm, selectedLegalRelevance]);

  const toggleLegalRelevance = (level: string) => {
    const newSet = new Set(selectedLegalRelevance);
    if (newSet.has(level)) {
      newSet.delete(level);
    } else {
      newSet.add(level);
    }
    setSelectedLegalRelevance(newSet);
  };

  const toggleSection = (sectionKey: string) => {
    const newSet = new Set(collapsedSections);
    if (newSet.has(sectionKey)) {
      newSet.delete(sectionKey);
    } else {
      newSet.add(sectionKey);
    }
    setCollapsedSections(newSet);
  };

  const isSectionCollapsed = (sectionKey: string): boolean => {
    return collapsedSections.has(sectionKey);
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderRecordBadges = (records: string[] | string) => {
    if (!records) return null;

    // Ensure records is always an array
    const recordsArray = Array.isArray(records) ? records : [records];
    if (recordsArray.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5">
        {recordsArray.map((record, idx) => (
          <button
            key={idx}
            onClick={() => openSourcePanel([String(record)])}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
            title="Click to view source record in side panel"
          >
            <FileText className="w-3 h-3 mr-1" />
            {String(record)}
          </button>
        ))}
      </div>
    );
  };

  const renderContradiction = (item: StructuredContradiction, idx: number, sectionKey: string) => (
    <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <AlertCircle className="w-5 h-5 text-red-500" />
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-gray-900 leading-relaxed">{item.description}</p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {item.category && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                {item.category}
              </span>
            )}
            {item.severity && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${getSeverityBadgeColor(item.severity)}`}>
                {item.severity}
              </span>
            )}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${getLegalRelevanceBadgeColor(item.legal_relevance)}`}>
              {item.legal_relevance?.toUpperCase() || 'N/A'}
            </span>
          </div>

          {renderRecordBadges(item.records)}

          {hasComment(sectionKey, idx) && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm mt-2">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-purple-700 mb-1 text-xs">Expert Comment:</div>
                  <div className="text-gray-700 whitespace-pre-wrap">{getComment(sectionKey, idx)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => openCommentModal(sectionKey, idx)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            hasComment(sectionKey, idx)
              ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200'
              : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
          }`}
          title={hasComment(sectionKey, idx) ? 'Edit comment' : 'Add comment'}
        >
          <MessageCircle className="w-4 h-4 inline mr-1" />
          {hasComment(sectionKey, idx) ? `${getComment(sectionKey, idx).length > 0 ? '1' : ''}` : ''}
        </button>
      </div>
    </div>
  );

  const renderRedFlag = (item: StructuredRedFlag, idx: number, sectionKey: string) => (
    <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
              {item.category}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${getLegalRelevanceBadgeColor(item.legal_relevance)}`}>
              {item.legal_relevance?.toUpperCase() || 'N/A'}
            </span>
          </div>

          <p className="text-gray-900 leading-relaxed">{item.issue}</p>

          {renderRecordBadges(item.records)}

          {hasComment(sectionKey, idx) && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm mt-2">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-purple-700 mb-1 text-xs">Expert Comment:</div>
                  <div className="text-gray-700 whitespace-pre-wrap">{getComment(sectionKey, idx)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => openCommentModal(sectionKey, idx)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            hasComment(sectionKey, idx)
              ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200'
              : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
          }`}
          title={hasComment(sectionKey, idx) ? 'Edit comment' : 'Add comment'}
        >
          <MessageCircle className="w-4 h-4 inline mr-1" />
          {hasComment(sectionKey, idx) ? `${getComment(sectionKey, idx).length > 0 ? '1' : ''}` : ''}
        </button>
      </div>
    </div>
  );

  const renderExpertOpinion = (item: StructuredExpertOpinion, idx: number, sectionKey: string) => (
    <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <User className="w-5 h-5 text-blue-500" />
        </div>
        <div className="flex-1 space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">{item.topic}</h4>
          <p className="text-sm text-gray-600 leading-relaxed">{item.reason}</p>
          {renderRecordBadges(item.records)}

          {hasComment(sectionKey, idx) && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm mt-2">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-purple-700 mb-1 text-xs">Expert Comment:</div>
                  <div className="text-gray-700 whitespace-pre-wrap">{getComment(sectionKey, idx)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => openCommentModal(sectionKey, idx)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            hasComment(sectionKey, idx)
              ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200'
              : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
          }`}
          title={hasComment(sectionKey, idx) ? 'Edit comment' : 'Add comment'}
        >
          <MessageCircle className="w-4 h-4 inline mr-1" />
          {hasComment(sectionKey, idx) ? `${getComment(sectionKey, idx).length > 0 ? '1' : ''}` : ''}
        </button>
      </div>
    </div>
  );

  const renderChronologyItem = (item: string, idx: number, sectionKey: string, totalItems: number) => {
    const isLast = idx === totalItems - 1;
    const { cleanText, recordIds } = extractRecordIds(item);

    return (
      <div key={idx} className="relative flex gap-4 group">
        {/* Timeline line and dot */}
        <div className="relative flex flex-col items-center">
          {/* Dot */}
          <div className="w-3 h-3 bg-blue-600 rounded-full ring-4 ring-blue-50 z-10 group-hover:ring-blue-100 transition-all"></div>
          {/* Connecting line */}
          {!isLast && (
            <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-400 to-blue-200 mt-1"></div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 pb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow group-hover:border-blue-300">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <p className="text-sm text-gray-700 leading-relaxed">{cleanText}</p>
                {recordIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {recordIds.map((recordId, ridx) => (
                      <button
                        key={ridx}
                        onClick={() => openSourcePanel([recordId])}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                        title="Click to view source record in side panel"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        {recordId}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => openCommentModal(sectionKey, idx)}
                className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  hasComment(sectionKey, idx)
                    ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                }`}
                title={hasComment(sectionKey, idx) ? 'Edit comment' : 'Add comment'}
              >
                <MessageCircle className="w-3 h-3 inline" />
              </button>
            </div>
            {hasComment(sectionKey, idx) && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs mt-3">
                <div className="flex items-start gap-2">
                  <MessageCircle className="w-3 h-3 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-purple-700 mb-1">Expert Comment:</div>
                    <div className="text-gray-700 whitespace-pre-wrap">{getComment(sectionKey, idx)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStringItem = (item: string, idx: number, sectionKey: string) => {
    const { cleanText, recordIds } = extractRecordIds(item);

    return (
      <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-2">
            <p className="text-sm text-gray-700 leading-relaxed">{cleanText}</p>
            {recordIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recordIds.map((recordId, ridx) => (
                  <button
                    key={ridx}
                    onClick={() => openSourcePanel([recordId])}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                    title="Click to view source record in side panel"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    {recordId}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => openCommentModal(sectionKey, idx)}
            className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors ${
              hasComment(sectionKey, idx)
                ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200'
                : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
            }`}
            title={hasComment(sectionKey, idx) ? 'Edit comment' : 'Add comment'}
          >
            <MessageCircle className="w-3 h-3 inline" />
          </button>
        </div>
        {hasComment(sectionKey, idx) && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs mt-2">
            <div className="flex items-start gap-2">
              <MessageCircle className="w-3 h-3 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-purple-700 mb-1">Expert Comment:</div>
                <div className="text-gray-700 whitespace-pre-wrap">{getComment(sectionKey, idx)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGenericStructuredItem = (item: any, idx: number, sectionKey: string) => (
    <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <Activity className="w-5 h-5 text-gray-600" />
        </div>
        <div className="flex-1 space-y-2">
          {/* Display main text fields */}
          {Object.entries(item).map(([key, value]) => {
            // Skip records array and metadata fields for main display
            if (key === 'records' || key === 'legal_relevance' || key === 'category' || key === 'severity') return null;

            // Handle different value types
            let displayValue: string;
            if (Array.isArray(value)) {
              displayValue = value.join(', ');
            } else if (typeof value === 'object' && value !== null) {
              displayValue = JSON.stringify(value);
            } else {
              displayValue = String(value || '');
            }

            return (
              <div key={key}>
                <p className="text-sm font-medium text-gray-500 capitalize">{key.replace(/_/g, ' ')}</p>
                <p className="text-gray-900 leading-relaxed">{displayValue}</p>
              </div>
            );
          })}

          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {item.category && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                {item.category}
              </span>
            )}
            {item.severity && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${getSeverityBadgeColor(item.severity)}`}>
                {item.severity}
              </span>
            )}
            {item.legal_relevance && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${getLegalRelevanceBadgeColor(item.legal_relevance)}`}>
                {item.legal_relevance?.toUpperCase() || 'N/A'}
              </span>
            )}
          </div>

          {/* Record badges */}
          {item.records && renderRecordBadges(item.records)}

          {hasComment(sectionKey, idx) && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm mt-2">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-purple-700 mb-1 text-xs">Expert Comment:</div>
                  <div className="text-gray-700 whitespace-pre-wrap">{getComment(sectionKey, idx)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => openCommentModal(sectionKey, idx)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            hasComment(sectionKey, idx)
              ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200'
              : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
          }`}
          title={hasComment(sectionKey, idx) ? 'Edit comment' : 'Add comment'}
        >
          <MessageCircle className="w-4 h-4 inline mr-1" />
          {hasComment(sectionKey, idx) ? `${getComment(sectionKey, idx).length > 0 ? '1' : ''}` : ''}
        </button>
      </div>
    </div>
  );

  const renderSection = (sectionKey: string, items: any[]) => {
    if (items.length === 0) return null;

    const isStructured = isStructuredArray(items);
    const sectionTitle = sectionKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    let icon = <Activity className="w-5 h-5" />;
    if (sectionKey === 'chronology') icon = <Clock className="w-5 h-5" />;
    if (sectionKey === 'contradictions') icon = <AlertCircle className="w-5 h-5" />;
    if (sectionKey === 'red_flags') icon = <AlertTriangle className="w-5 h-5" />;
    if (sectionKey === 'expert_opinions_needed') icon = <User className="w-5 h-5" />;

    const isCollapsed = isSectionCollapsed(sectionKey);

    return (
      <section key={sectionKey} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
          {icon}
          <h2 className="text-lg font-semibold text-gray-900">{sectionTitle}</h2>
          <span className="ml-auto text-sm font-medium text-gray-500">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </button>

        {!isCollapsed && (
          <div className={`px-4 pb-4 ${sectionKey === 'chronology' ? 'space-y-0' : 'space-y-2'} border-t border-gray-100`}>
            <div className="pt-3"></div>
            {items.map((item, idx) => {
            if (sectionKey === 'contradictions' && isStructured) {
              return renderContradiction(item as StructuredContradiction, idx, sectionKey);
            }
            if (sectionKey === 'red_flags' && isStructured) {
              return renderRedFlag(item as StructuredRedFlag, idx, sectionKey);
            }
            if (sectionKey === 'expert_opinions_needed' && isStructured) {
              return renderExpertOpinion(item as StructuredExpertOpinion, idx, sectionKey);
            }
            if (sectionKey === 'chronology') {
              return renderChronologyItem(item, idx, sectionKey, items.length);
            }
            // Fallback: use generic structured renderer for unknown structured types
            if (isStructured) {
              return renderGenericStructuredItem(item, idx, sectionKey);
            }
            return renderStringItem(item, idx, sectionKey);
            })}
          </div>
        )}
      </section>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading case...</p>
        </div>
      </div>
    );
  }

  if (error || !case_) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">Error Loading Case</h2>
          <p className="text-gray-600 text-center">{error || 'Unknown error'}</p>
          <Link 
            href="/admin"
            className="mt-6 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const totalFindings = Object.values(filteredSections).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Dashboard
              </Link>
              <div className="h-6 w-px bg-gray-300"></div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{case_.customer_name}</h1>
                <p className="text-sm text-gray-500">
                  {getPipelineName(case_.pipeline)} • {case_.records_count} records
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveComments}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Comments'}
              </button>
              <button
                onClick={downloadPDF}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </button>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">Case ID: {case_.id}</p>
                <p className="text-xs text-gray-500">{case_.status}</p>
              </div>
            </div>
          </div>
          {saveMessage && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <p className="text-sm text-green-800">{saveMessage}</p>
            </div>
          )}
        </div>
      </header>

      {/* Search & Filters Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search all findings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Legal Relevance Filters */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Legal Relevance:</span>
              {['high', 'medium', 'low'].map((level) => (
                <button
                  key={level}
                  onClick={() => toggleLegalRelevance(level)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    selectedLegalRelevance.has(level)
                      ? getLegalRelevanceBadgeColor(level)
                      : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  {level.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Active Filters Summary */}
          {(searchTerm || selectedLegalRelevance.size < 3) && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">{totalFindings} findings</span>
              {searchTerm && (
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
                  containing "{searchTerm}"
                </span>
              )}
              {selectedLegalRelevance.size < 3 && (
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
                  {Array.from(selectedLegalRelevance).join(', ')} relevance
                </span>
              )}
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedLegalRelevance(new Set(['high', 'medium', 'low']));
                }}
                className="ml-2 text-blue-600 hover:text-blue-800 underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {Object.entries(filteredSections).length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No findings match your filters</h3>
              <p className="text-gray-600">Try adjusting your search or filter criteria</p>
            </div>
          ) : (
            Object.entries(filteredSections).map(([key, items]) => renderSection(key, items))
          )}
        </div>
      </main>

      {/* Source Panel */}
      {sourcePanelOpen && (
        <div className="fixed right-2 top-[95px] bottom-2 w-[500px] bg-white border-l border-gray-200 shadow-xl overflow-hidden z-40 rounded-lg">
          <SourcePanel
            records={sourcePanelRecords}
            onClose={() => setSourcePanelOpen(false)}
            formatKey={formatKey}
            formatValue={formatValue}
          />
        </div>
      )}

      {/* Comment Modal */}
      {commentModalData && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-30 overflow-y-auto"
          onClick={() => setCommentModalData(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Expert Comment
              </h3>
              <button
                onClick={() => setCommentModalData(null)}
                className="text-white hover:text-gray-200 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">
                  Section: <span className="font-semibold">{commentModalData.section.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                  {' • '}
                  Item #{commentModalData.index + 1}
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 mb-4 max-h-40 overflow-y-auto">
                  {(() => {
                    const item = case_?.analysis[commentModalData.section]?.[commentModalData.index];
                    if (!item) return '(No content)';
                    if (typeof item === 'string') return item;
                    return JSON.stringify(item, null, 2);
                  })()}
                </div>
              </div>

              <label className="block mb-2 text-sm font-semibold text-gray-700">
                Expert Comment / Rationale:
              </label>
              <textarea
                value={commentModalData.currentComment}
                onChange={(e) => setCommentModalData({ ...commentModalData, currentComment: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 min-h-[120px] text-sm"
                placeholder="Explain reasoning, reference source records, note clinical judgment..."
              />

              <div className="text-xs text-gray-500 mt-2 italic">
                Tip: Reference specific records, cite clinical guidelines, or explain diagnostic reasoning
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setCommentModalData(null)}
                className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => saveComment(commentModalData.section, commentModalData.index, commentModalData.currentComment)}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Save Comment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Toggle Button - Floating */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all"
        title="Chat with case"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Chat Panel */}
      {showChat && (
        <div className="fixed bottom-0 right-6 w-120 h-[600px] bg-white border-2 border-gray-300 rounded-t-xl shadow-2xl z-40 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex items-center justify-between rounded-t-lg">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Ask about this case
            </h3>
            <button
              onClick={() => setShowChat(false)}
              className="text-white hover:text-gray-200 text-xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm mt-8">
                <p className="mb-4">Ask questions about this document</p>
                <div className="text-xs text-left space-y-1 bg-white p-3 rounded border border-gray-200">
                  <p className="font-semibold text-gray-700 mb-2">Example questions:</p>
                  <p>• &quot;Summarize this document with 3-5 key points&quot;</p>
                </div>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <div className={`text-sm prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : ''}`}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Ask a question..."
                disabled={chatLoading}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}