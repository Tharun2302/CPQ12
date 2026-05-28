const fs = require('fs');
const path = 'c:/Users/AbhilashaK/Desktop/cpq/CPQ12/src/pages/EsignPlaceFieldsPage.tsx';
const content = fs.readFileSync(path, 'utf8');
const marker = '          {/* placeholder to silence linter - old nav removed */}';
const idx = content.indexOf(marker);
if (idx === -1) { console.error('MARKER NOT FOUND'); process.exit(1); }
console.log('Found marker at index:', idx, 'line ~', content.substring(0, idx).split('\n').length);

const before = content.substring(0, idx);

const newEnd = `          <div className="flex-1 overflow-y-auto">
            {activeTool === 'recipients' && (
              <div className="p-4 space-y-4">
                <div id="esign-tour-recipients-panel">
                  {recipients.length === 0 && (
                    <p className="text-xs text-slate-500 mb-3">Add at least one recipient to send this document for signature.</p>
                  )}
                  <div className="space-y-2">
                    {recipients.map((r, index) => {
                      const isSelected = selectedRecipientId === r.id;
                      const effectiveAction = r.action ?? (r.role === 'Technical Team' || r.role === 'Legal Team' ? 'reviewer' : (r.role?.toLowerCase() === 'reviewer' ? 'reviewer' : 'signer'));
                      const isReviewer = effectiveAction === 'reviewer';
                      const bg = ['#4F46E5','#0EA5E9','#10B981','#F59E0B','#8B5CF6'][index % 5];
                      const raw = (r.name || r.email).trim().split(/\\s+/).filter(Boolean);
                      const initials = raw.length >= 2 ? (raw[0][0] + raw[raw.length - 1][0]).toUpperCase() : (r.name || r.email).slice(0, 2).toUpperCase();
                      return (
                        <div key={r.id} className={\`flex items-center gap-3 rounded-lg border px-3 py-2.5 \${isSelected ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'} group\`}>
                          <span className="shrink-0 text-xs text-slate-400 w-4 text-center font-medium">{index + 1}</span>
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0" style={{ background: bg }}>{initials}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{r.name || r.email}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={\`text-[10px] font-semibold px-1.5 py-0.5 rounded \${isReviewer ? 'bg-orange-100 text-orange-700' : 'bg-rose-100 text-rose-700'}\`}>
                                {isReviewer ? 'Reviewer' : 'Signer'}
                              </span>
                              <select
                                value={effectiveAction}
                                onChange={(e) => updateRecipientAction(r.id, e.target.value as 'signer' | 'reviewer')}
                                className="text-[10px] rounded border border-slate-200 bg-white py-0.5 pr-4 pl-1 text-slate-600"
                              >
                                <option value="signer">Signer</option>
                                <option value="reviewer">Reviewer</option>
                              </select>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">{r.email}</p>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {recipients.length > 1 && (
                              <>
                                <button type="button" onClick={() => moveRecipientUp(index)} disabled={index === 0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => moveRecipientDown(index)} disabled={index === recipients.length - 1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                            <button type="button" onClick={() => removeRecipient(r.id)} className="p-1 text-slate-300 hover:text-red-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <input type="text" value={newRecipient.name} onChange={(e) => { setNewRecipient((p) => ({ ...p, name: e.target.value })); setRecipientError(null); }} placeholder="Name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs mb-1.5" />
                    <input
                      type="email"
                      value={newRecipient.email}
                      onChange={(e) => {
                        const email = e.target.value;
                        setNewRecipient((p) => {
                          const entry = lookupRecipient(email);
                          const nextName = entry && !p.name.trim() ? entry.name : p.name;
                          return { ...p, email, name: nextName };
                        });
                        setRecipientError(null);
                      }}
                      placeholder="Email"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs mb-1.5"
                    />
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-slate-600">Role:</span>
                      <select
                        value={newRecipient.role}
                        onChange={(e) => setNewRecipient((p) => ({ ...p, role: e.target.value as 'signer' | 'reviewer' }))}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="signer">Signer</option>
                        <option value="reviewer">Reviewer</option>
                      </select>
                    </div>
                    {recipientError && <p className="text-xs text-red-600 mt-1">{recipientError}</p>}
                    <button type="button" onClick={addRecipient} disabled={addingRecipient || !newRecipient.email.trim()} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      {addingRecipient ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add recipient
                    </button>
                    {recipients.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <button type="button" onClick={saveCurrentRecipientsToSaved} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800">
                          <Bookmark className="h-3.5 w-3.5" /> Save current to list
                        </button>
                        <div className="flex gap-1.5 items-center flex-wrap">
                          <input type="text" value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} placeholder="Group name" className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs" />
                          <button type="button" onClick={saveCurrentAsGroup} disabled={!groupNameInput.trim()} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                            <Users className="h-3.5 w-3.5" /> Save as group
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {savedGroups.length > 0 && (
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-xs font-medium text-slate-700 mb-1">Saved groups</p>
                    <p className="text-[10px] text-slate-500 mb-1.5">Use &quot;Add&quot; to add a group to this document.</p>
                    <div className="space-y-1.5">
                      {savedGroups.map((g) => {
                        const isExpanded = expandedGroupId === g.id;
                        const isDefault = defaultGroupId === g.id;
                        return (
                          <div key={g.id} className={\`rounded border overflow-hidden \${isDefault ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200 bg-white'}\`}>
                            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                              <button type="button" onClick={() => setExpandedGroupId(isExpanded ? null : g.id)} className="min-w-0 flex-1 flex items-center gap-1 text-left">
                                <span className="text-slate-400">{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
                                <p className="text-xs font-medium text-slate-800 truncate">{g.name}</p>
                                {isDefault && <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Default</span>}
                                <p className="text-[10px] text-slate-500 shrink-0">({g.recipients.length})</p>
                              </button>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button type="button" onClick={() => setDefaultGroup(isDefault ? null : g.id)} className={\`p-1 rounded \${isDefault ? 'text-amber-600 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}\`} title={isDefault ? 'Remove as default group' : 'Set as default group'}>
                                  <Star className={\`h-3.5 w-3.5 \${isDefault ? 'fill-current' : ''}\`} />
                                </button>
                                <button type="button" onClick={() => addGroupToDocument(g)} className="p-1 rounded text-indigo-600 hover:bg-indigo-50 font-medium text-xs" title="Add all to current document">Add</button>
                                <button type="button" onClick={() => startEditingGroup(g)} className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50" title="Edit group"><Pencil className="h-3 w-3" /></button>
                                <button type="button" onClick={() => removeGroup(g.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove group"><Trash2 className="h-3 w-3" /></button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-slate-100 bg-slate-50/70 px-2 py-1.5 space-y-1 max-h-32 overflow-y-auto">
                                {g.recipients.map((r, i) => (
                                  <div key={i} className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="text-slate-700 truncate">{r.name || r.email}</span>
                                    <span className="text-slate-500 truncate shrink-0 max-w-[120px]">{r.email}</span>
                                    <span className={\`shrink-0 px-1 py-0.5 rounded text-[9px] font-medium \${r.role === 'reviewer' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}\`}>{r.role}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {savedRecipients.length > 0 && (
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-xs font-medium text-slate-700 mb-1.5">Saved recipients</p>
                    <div className="space-y-1.5">
                      {savedRecipients.map((s) => {
                        const alreadyAdded = recipients.some((r) => r.email.toLowerCase() === s.email.toLowerCase());
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-1 rounded border border-slate-200 bg-white px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-800 truncate">{s.name || s.email}</p>
                              <p className="text-[10px] text-slate-500 truncate">{s.email}</p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button type="button" onClick={() => addFromSaved(s)} disabled={alreadyAdded} className="p-1 rounded text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed" title={alreadyAdded ? 'Already added' : 'Add to document'}>
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => removeSavedRecipient(s.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove from saved">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTool === 'fields' && (
              <div className="p-4 space-y-3" id="esign-tour-field-palette">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Place fields for:</p>
                  <select
                    id="esign-tour-place-for-select"
                    value={selectedRecipientId || ''}
                    onChange={(e) => setSelectedRecipientId(e.target.value || null)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value="">— None —</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.email} ({getPlaceFieldsDropdownLabel(r)})
                      </option>
                    ))}
                  </select>
                  {selectedRecipientId && placingFieldsForReviewer && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      For reviewers, <strong className="font-medium text-slate-800">Signature</strong> is not used. Drag <strong className="font-medium text-slate-800">Name</strong>, <strong className="font-medium text-slate-800">Title</strong>, <strong className="font-medium text-slate-800">Date</strong>, or <strong className="font-medium text-slate-800">Text</strong> onto the PDF.
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-500">Drag onto the document to place</p>
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_DEFS.map(({ type, label, Icon }) => {
                    const signatureBlockedForReviewer = placingFieldsForReviewer && type === 'signature';
                    return (
                      <div
                        key={type}
                        draggable={!signatureBlockedForReviewer}
                        onDragStart={(e) => {
                          if (signatureBlockedForReviewer) {
                            e.preventDefault();
                            return;
                          }
                          setDragSource(type);
                          e.dataTransfer.setData('text/plain', type);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onDragEnd={() => setDragSource(null)}
                        title={signatureBlockedForReviewer ? 'Reviewers cannot be assigned signature fields' : undefined}
                        className={\`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-colors \${
                          signatureBlockedForReviewer
                            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                            : dragSource === type
                              ? 'border-blue-400 bg-blue-50 cursor-grab active:cursor-grabbing'
                              : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 cursor-grab active:cursor-grabbing'
                        }\`}
                      >
                        <Icon className={\`h-5 w-5 shrink-0 \${signatureBlockedForReviewer ? 'text-slate-400' : 'text-blue-600'}\`} />
                        <span className={\`text-xs font-medium text-center \${signatureBlockedForReviewer ? 'text-slate-500' : 'text-slate-700'}\`}>{label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Scroll to the page you want, then drag fields onto the document.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default EsignPlaceFieldsPage;
`;

const result = before + newEnd;
fs.writeFileSync(path, result, 'utf8');
console.log('Done. New file length:', result.length, 'lines:', result.split('\n').length);
console.log('Last 5 lines:');
result.split('\n').slice(-6).forEach((l, i) => console.log(i, JSON.stringify(l)));
