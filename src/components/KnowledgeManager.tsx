import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Business, KnowledgeItem, KnowledgeSourceType } from '../types/aicare';
import { auth } from '../lib/firebase';
import {
  addKnowledgeItem,
  deleteKnowledgeItem,
  syncPublishedBotRuntime,
  updateKnowledgeItem,
} from '../lib/firestoreService';
import { chunkKnowledgeText } from '../utils/knowledge';

interface KnowledgeManagerProps {
  business: Business;
  items: KnowledgeItem[];
  onSynced?: () => void;
}

export function KnowledgeManager({ business, items, onSynced }: KnowledgeManagerProps) {
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>('manual');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const syncRuntime = async (updatedList: KnowledgeItem[]) => {
    try {
      await syncPublishedBotRuntime(business, updatedList);
      onSynced?.();
    } catch (err) {
      console.error('Runtime sync error:', err);
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    if (!title.trim() || !content.trim()) {
      setError('Please enter both a title and content for this knowledge entry.');
      return;
    }

    setSaving(true);
    try {
      const chunks = chunkKnowledgeText(content.trim(), 900, 120);
      const created = await addKnowledgeItem(business.id, business.ownerId, {
        title: title.trim(),
        sourceType,
        content: content.trim(),
        chunksCount: Math.max(1, chunks.length),
      });
      await syncRuntime([...items, created]);
      setTitle('');
      setContent('');
      setStatusMsg(`Saved "${created.title}" (${created.chunksCount} knowledge chunk${created.chunksCount > 1 ? 's' : ''}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save knowledge item.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setStatusMsg('');
    setUploading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to upload files.');
      const token = await user.getIdToken();

      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/knowledge/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Document processing failed.');
      }

      const created = await addKnowledgeItem(business.id, business.ownerId, {
        title: data.fileName.replace(/\.[^.]+$/, ''),
        sourceType: data.sourceType,
        fileName: data.fileName,
        content: data.text,
        chunksCount: data.chunksCount,
      });

      await syncRuntime([...items, created]);
      setStatusMsg(
        `Successfully processed "${data.fileName}" into ${data.chunksCount} searchable chunk${
          data.chunksCount > 1 ? 's' : ''
        }.${data.truncated ? ' (Content truncated to 48,000 characters.)' : ''}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File extraction failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEdit = async (item: KnowledgeItem) => {
    if (!editTitle.trim() || !editContent.trim()) {
      setError('Title and content cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const chunks = chunkKnowledgeText(editContent.trim(), 900, 120);
      await updateKnowledgeItem(business.id, item.id, {
        title: editTitle.trim(),
        content: editContent.trim(),
        chunksCount: Math.max(1, chunks.length),
        status: 'processed',
      });
      const updatedList = items.map((i) =>
        i.id === item.id
          ? {
              ...i,
              title: editTitle.trim(),
              content: editContent.trim(),
              chunksCount: Math.max(1, chunks.length),
              status: 'processed' as const,
            }
          : i
      );
      await syncRuntime(updatedList);
      setEditingId(null);
      setStatusMsg(`Updated "${editTitle.trim()}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async (item: KnowledgeItem) => {
    setSaving(true);
    setError('');
    try {
      const chunks = chunkKnowledgeText(item.content, 900, 120);
      await updateKnowledgeItem(business.id, item.id, {
        title: item.title,
        content: item.content,
        chunksCount: Math.max(1, chunks.length),
        status: 'processed',
      });
      const updatedList = items.map((i) =>
        i.id === item.id
          ? { ...i, chunksCount: Math.max(1, chunks.length), status: 'processed' as const }
          : i
      );
      await syncRuntime(updatedList);
      setStatusMsg(`Reprocessed "${item.title}" (${Math.max(1, chunks.length)} chunks).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reprocessing failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: KnowledgeItem) => {
    setError('');
    setStatusMsg('');
    try {
      await deleteKnowledgeItem(business.id, item.id);
      await syncRuntime(items.filter((i) => i.id !== item.id));
      setStatusMsg(`Deleted "${item.title}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete entry.');
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Add Manual / FAQ / Product Entry */}
        <form
          onSubmit={handleAddManual}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900">Add Business Knowledge</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="kb-type" className="block text-xs font-medium text-slate-700 mb-1">
                Information type
              </label>
              <select
                id="kb-type"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as KnowledgeSourceType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="manual">Policies & General Info</option>
                <option value="faq">Frequently Asked Questions</option>
                <option value="product">Products & Pricing</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="kb-title" className="block text-xs font-medium text-slate-700 mb-1">
                Entry title *
              </label>
              <input
                id="kb-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Delivery & Return Policy"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="kb-content" className="block text-xs font-medium text-slate-700 mb-1">
              Content *
            </label>
            <textarea
              id="kb-content"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your prices, store policies, troubleshooting steps, or Q&A pairs..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Knowledge Entry'}
          </button>
        </form>

        {/* Document Upload */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Upload Business Documents</h3>
            <p className="mt-1 text-sm text-slate-600">
              Upload price catalogs, service menus, or policy documents. Supported formats: PDF, DOCX, CSV, TXT (max 5 MB).
            </p>
          </div>

          <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/70">
            <Upload className="w-7 h-7 text-blue-600 mx-auto mb-2" />
            <div className="text-sm font-semibold text-slate-900">
              {uploading ? 'Extracting text...' : 'Choose a file to upload'}
            </div>
            <div className="text-xs text-slate-500 mt-1">.pdf, .docx, .csv, .txt</div>
            <input
              type="file"
              accept=".pdf,.docx,.csv,.txt,.md"
              disabled={uploading}
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>

          <p className="text-xs text-slate-500">
            Only files containing readable text are marked as processed. Scanned image-only PDFs should be entered manually.
          </p>
        </div>
      </div>

      {/* Stored Knowledge List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Stored Knowledge Base ({items.length})
          </h3>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No knowledge entries added yet. Add an FAQ, price list, or upload a document above so your assistant can answer customer questions accurately.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {items.map((item) => (
              <div key={item.id} className="p-5">
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-medium"
                    />
                    <textarea
                      rows={5}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveEdit(item)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <h4 className="text-sm font-semibold text-slate-900 truncate">{item.title}</h4>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                        <span className="uppercase">{item.sourceType}</span>
                        {item.fileName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.fileName}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{item.chunksCount} chunks</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            item.status === 'processed' ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'
                          }
                        >
                          {item.status === 'processed' ? 'Processed' : 'Error'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 line-clamp-3 whitespace-pre-line">
                        {item.content}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditTitle(item.title);
                          setEditContent(item.content);
                        }}
                        aria-label={`Edit ${item.title}`}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReprocess(item)}
                        aria-label={`Reprocess ${item.title}`}
                        title="Reprocess chunks"
                        className="p-2 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        aria-label={`Delete ${item.title}`}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
