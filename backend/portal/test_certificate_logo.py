from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from reportlab.pdfgen.canvas import Canvas

from .certificate_renderer import _draw_logo


class CertificateLogoTests(SimpleTestCase):
    @override_settings(CERTIFICATE_LOGO_FILENAME="light.png")
    def test_bundled_logo_renders(self):
        self.assertGreater(_draw_logo(Canvas(BytesIO()), 0, 0), 0)

    @override_settings(CERTIFICATE_LOGO_FILENAME="light.png")
    def test_backend_only_layout(self):
        from django.conf import settings

        logo = (Path(settings.BASE_DIR) / "assets" / "light.png").read_bytes()
        with TemporaryDirectory() as directory:
            base = Path(directory) / "app"
            (base / "assets").mkdir(parents=True)
            (base / "assets" / "light.png").write_bytes(logo)
            with override_settings(BASE_DIR=base):
                self.assertGreater(_draw_logo(Canvas(BytesIO()), 0, 0), 0)

    def test_no_fallback_for_missing_configuration_or_file(self):
        for filename in ("", "missing-logo.png"):
            with self.subTest(filename=filename), override_settings(CERTIFICATE_LOGO_FILENAME=filename):
                with self.assertRaises(ImproperlyConfigured):
                    _draw_logo(Mock(), 0, 0)
