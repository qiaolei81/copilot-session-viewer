/**
 * Session tags composable — tag CRUD, autocomplete, colors.
 */
import { ref } from 'vue';

const TAG_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
];

export function useSessionTags(sessionId, source) {
  const sessionTags = ref([]);
  const allTags = ref([]);
  const tagsEditing = ref(false);
  const editingTags = ref([]);
  const tagInputValue = ref('');
  const tagInputRef = ref(null);
  const tagsError = ref('');
  const showAutocomplete = ref(false);
  const autocompleteOptions = ref([]);
  const autocompleteSelectedIndex = ref(0);
  let _blurTimerId = null;

  const getTagColor = (tag) => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  };

  const loadTags = async () => {
    try {
      const response = await fetch(`/api/${encodeURIComponent(source.value)}/sessions/${sessionId.value}/tags`);
      if (response.ok) { const data = await response.json(); sessionTags.value = data.tags || []; }
    } catch (err) { console.error('Error loading tags:', err); }
  };

  const loadAllTags = async () => {
    try {
      const response = await fetch('/api/tags');
      if (response.ok) { const data = await response.json(); allTags.value = data.tags || []; }
    } catch (err) { console.error('Error loading all tags:', err); }
  };

  const saveTags = async (tags) => {
    try {
      const response = await fetch(`/api/${encodeURIComponent(source.value)}/sessions/${sessionId.value}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags })
      });
      if (response.ok) {
        const data = await response.json();
        sessionTags.value = data.tags || [];
        tagsError.value = '';
        return true;
      } else {
        const error = await response.json();
        tagsError.value = error.error || 'Failed to save tags';
        return false;
      }
    } catch (err) {
      tagsError.value = 'Network error';
      return false;
    }
  };

  const startEditTags = () => {
    editingTags.value = [...sessionTags.value];
    tagsEditing.value = true;
    tagsError.value = '';
    setTimeout(() => tagInputRef.value?.focus(), 10);
  };

  const cancelEditTags = () => {
    tagsEditing.value = false;
    editingTags.value = [];
    tagInputValue.value = '';
    showAutocomplete.value = false;
    tagsError.value = '';
  };

  const addTag = () => {
    const tag = tagInputValue.value.trim().toLowerCase();
    if (!tag) return;
    if (tag.length > 30) { tagsError.value = 'Tag must be 30 characters or less'; return; }
    if (editingTags.value.length >= 10) { tagsError.value = 'Maximum 10 tags per session'; return; }
    if (editingTags.value.includes(tag)) { tagsError.value = 'Tag already added'; tagInputValue.value = ''; return; }
    editingTags.value.push(tag);
    tagInputValue.value = '';
    showAutocomplete.value = false;
    tagsError.value = '';
  };

  const removeTagFromEdit = (tag) => {
    editingTags.value = editingTags.value.filter(t => t !== tag);
    tagsError.value = '';
  };

  const updateAutocomplete = () => {
    const input = tagInputValue.value.trim().toLowerCase();
    if (!input) { showAutocomplete.value = false; autocompleteOptions.value = []; return; }
    const filtered = allTags.value.filter(tag => tag.toLowerCase().includes(input) && !editingTags.value.includes(tag)).slice(0, 5);
    if (filtered.length > 0) { showAutocomplete.value = true; autocompleteOptions.value = filtered; autocompleteSelectedIndex.value = 0; }
    else { showAutocomplete.value = false; autocompleteOptions.value = []; }
  };

  const selectAutocompleteOption = (option) => { tagInputValue.value = option; addTag(); };

  const saveTagsOnBlur = async () => {
    if (_blurTimerId) clearTimeout(_blurTimerId);
    _blurTimerId = setTimeout(async () => {
      if (!tagsEditing.value) return;
      const success = await saveTags(editingTags.value);
      if (success) {
        tagsEditing.value = false;
        editingTags.value = [];
        tagInputValue.value = '';
        showAutocomplete.value = false;
        await loadAllTags();
      }
    }, 200);
  };

  const cleanup = () => {
    if (_blurTimerId) { clearTimeout(_blurTimerId); _blurTimerId = null; }
  };

  return {
    sessionTags,
    allTags,
    tagsEditing,
    editingTags,
    tagInputValue,
    tagInputRef,
    tagsError,
    showAutocomplete,
    autocompleteOptions,
    autocompleteSelectedIndex,
    getTagColor,
    loadTags,
    loadAllTags,
    startEditTags,
    cancelEditTags,
    addTag,
    removeTagFromEdit,
    updateAutocomplete,
    selectAutocompleteOption,
    saveTagsOnBlur,
    cleanup
  };
}
