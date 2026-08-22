# 13: File uploads

**What to build:** Wire Vercel Blob free tier (250MB) for patient document uploads. A visitor can upload a document to a patient record, see it in the documents tab, and the file persists across sessions.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `@vercel/blob` installed and configured
- [ ] Upload Server Action at `app/actions/documents.ts`
- [ ] File type allowlist enforced (PDF, images, common document types)
- [ ] File size cap (10MB per file) validated before upload
- [ ] Upload metadata stored in `patient_documents` table (reference, filename, blob URL, uploader, timestamp)
- [ ] Patient detail documents tab renders real uploaded files
- [ ] Upload writes audit entry
- [ ] `BLOB_READ_WRITE_TOKEN` env var documented
