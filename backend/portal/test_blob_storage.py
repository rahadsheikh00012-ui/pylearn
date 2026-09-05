from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import SimpleTestCase

from .storage import VercelBlobStorage


class BlobUrlTests(SimpleTestCase):
    def make_storage(self, store_id):
        return VercelBlobStorage(token="test-token", store_id=store_id)

    @patch.dict("os.environ", {}, clear=True)
    def test_dashboard_and_bare_ids_build_the_same_url(self):
        for store_id in ("store_AbC123", "AbC123"):
            with self.subTest(store_id=store_id):
                storage = self.make_storage(store_id)
                self.assertEqual(
                    storage.url("avatars/profile photo.png"),
                    "https://abc123.public.blob.vercel-storage.com/avatars/profile%20photo.png",
                )

    @patch.dict("os.environ", {}, clear=True)
    @patch("portal.storage.put")
    def test_upload_url_is_cached_for_names_with_spaces(self, put):
        name = "avatars/profile photo.png"
        url = "https://abc123.public.blob.vercel-storage.com/avatars/profile%20photo.png"
        put.return_value = {"pathname": name, "url": url}
        storage = self.make_storage("store_AbC123")
        saved_name = storage._save(name, ContentFile(b"image"))
        storage.public_url_base = "https://unused.example.com"
        self.assertEqual(storage.url(saved_name), url)

    @patch.dict("os.environ", {}, clear=True)
    def test_explicit_url_base_is_preserved(self):
        storage = VercelBlobStorage(
            token="test-token", store_id="store_AbC123",
            public_url_base="https://media.example.com/",
        )
        self.assertEqual(storage.url("courses/cover.png"), "https://media.example.com/courses/cover.png")
