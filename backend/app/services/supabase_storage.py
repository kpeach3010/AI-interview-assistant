import uuid
from typing import BinaryIO

from supabase import create_client

from app.core.config import get_settings


class StorageService:
    def __init__(self) -> None:
        self._client = None

    @property
    def client(self):
        if self._client is None:
            settings = get_settings()
            self._client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        return self._client

    def upload_file(
        self,
        bucket: str,
        path: str,
        file_data: bytes | BinaryIO,
        content_type: str,
    ) -> str:
        self.client.storage.from_(bucket).upload(
            path,
            file_data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        return path

    def download_file(self, bucket: str, path: str) -> bytes:
        return self.client.storage.from_(bucket).download(path)

    def get_signed_url(self, bucket: str, path: str, expires_in: int = 3600) -> str:
        result = self.client.storage.from_(bucket).create_signed_url(path, expires_in)
        return result["signedURL"]

    def get_public_url(self, bucket: str, path: str) -> str:
        return self.client.storage.from_(bucket).get_public_url(path)

    @staticmethod
    def build_document_path(user_id: str, doc_id: str, filename: str) -> str:
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
        return f"{user_id}/{doc_id}/original.{ext}"

    @staticmethod
    def new_doc_id() -> str:
        return str(uuid.uuid4())


storage_service = StorageService()
