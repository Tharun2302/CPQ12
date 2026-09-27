'use strict';

// Heavy fields no list consumer reads; GET /api/documents/:id still returns them in full.
const DOCUMENTS_LIST_PROJECTION = Object.freeze({ fileData: 0, docxFileData: 0, templateData: 0 });

module.exports = { DOCUMENTS_LIST_PROJECTION };
