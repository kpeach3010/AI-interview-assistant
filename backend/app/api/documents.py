from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.schemas import DocumentResponse, DocumentUploadResponse
from app.core.auth import get_current_user
from app.core.database import db
from app.services.supabase_storage import storage_service

router = APIRouter(prefix="/documents", tags=["documents"])

BUCKET_MAP = {"cv": "cvs", "jd": "job-descriptions"}
MIME_MAP = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".txt": "text/plain",
}


@router.get("", response_model=list[DocumentResponse])
async def get_documents(
    user: Annotated[dict, Depends(get_current_user)],
    doc_type: str | None = None,
):
    user_id = user["sub"]
    docs = db.get_documents_by_user(user_id, doc_type)
    return docs


@router.get("/{doc_id}/url")
async def get_document_url(
    user: Annotated[dict, Depends(get_current_user)],
    doc_id: str,
):
    user_id = user["sub"]
    doc = db.get_document(doc_id, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    bucket = doc.get("storage_bucket")
    path = doc.get("storage_path")
    if not bucket or not path:
        raise HTTPException(status_code=400, detail="Document storage info missing")
        
    url = storage_service.get_signed_url(bucket, path, expires_in=3600)
    return {"url": url}

@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    user: Annotated[dict, Depends(get_current_user)],
    file: UploadFile = File(...),
    doc_type: str = Form(...),
):
    if doc_type not in BUCKET_MAP:
        raise HTTPException(status_code=400, detail="doc_type must be 'cv' or 'jd'")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    user_id = user["sub"]
    doc_id = storage_service.new_doc_id()
    bucket = BUCKET_MAP[doc_type]
    path = storage_service.build_document_path(user_id, doc_id, file.filename or "file.pdf")

    ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ".pdf"
    mime = file.content_type or MIME_MAP.get(ext, "application/octet-stream")

    storage_service.upload_file(bucket, path, content, mime)

    doc = db.create_document(
        {
            "id": doc_id,
            "user_id": user_id,
            "type": doc_type,
            "file_name": file.filename or "unknown",
            "mime_type": mime,
            "file_size_bytes": len(content),
            "storage_bucket": bucket,
            "storage_path": path,
        }
    )

    return DocumentUploadResponse(
        id=doc["id"],
        type=doc["type"],
        file_name=doc["file_name"],
        storage_path=doc["storage_path"],
    )

