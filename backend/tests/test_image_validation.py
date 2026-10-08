import asyncio
from io import BytesIO
import unittest
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from PIL import Image
from starlette.datastructures import Headers

from app.services.image_service import read_validated_image_upload
from app.services.image_validation import validate_image_content
from app.services.task_attachment_service import read_validated_task_attachment


def valid_image(format="PNG", size=(20, 20)):
    output = BytesIO()
    Image.new("RGB", size, "blue").save(output, format=format)
    return output.getvalue()


def upload(data, name="image.png", content_type="image/png"):
    return UploadFile(file=BytesIO(data), filename=name, headers=Headers({"content-type": content_type}))


class ImageValidationTest(unittest.TestCase):
    def test_real_png_jpeg_and_webp_decode_without_editing_bytes(self):
        for format, mime, suffix in [("PNG", "image/png", "png"), ("JPEG", "image/jpeg", "jpg"), ("WEBP", "image/webp", "webp")]:
            with self.subTest(format=format):
                data = valid_image(format)
                result = asyncio.run(read_validated_image_upload(upload(data, f"image.{suffix}", mime)))
                self.assertEqual(result.content, data)
                self.assertEqual(result.content_type, mime)

    def test_magic_header_without_decodable_image_is_rejected(self):
        for data in [b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xfffake", b"RIFF0000WEBPfake"]:
            with self.subTest(data=data), self.assertRaises(HTTPException) as error:
                validate_image_content(data, "image/png")
            self.assertEqual(error.exception.status_code, 400)

    def test_truncated_real_image_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            validate_image_content(valid_image("JPEG")[:-30], "image/jpeg")
        self.assertEqual(error.exception.status_code, 400)

    def test_dimensions_are_enforced_before_full_decoding(self):
        with self.assertRaises(HTTPException) as error:
            validate_image_content(valid_image(size=(8001, 1)), "image/png")
        self.assertEqual(error.exception.status_code, 413)

    def test_pixel_budget_is_enforced(self):
        with patch("app.services.image_validation.MAX_IMAGE_PIXELS", 100), self.assertRaises(HTTPException) as error:
            validate_image_content(valid_image(), "image/png")
        self.assertEqual(error.exception.status_code, 413)

    def test_mime_mismatch_extension_empty_and_size_are_rejected(self):
        cases = [(valid_image(), "image.jpg", "image/jpeg", 400), (valid_image(), "image.exe", "image/png", 415), (b"", "image.png", "image/png", 400), (b"x" * 614401, "image.png", "image/png", 413)]
        for data, name, mime, status in cases:
            with self.subTest(name=name, status=status), self.assertRaises(HTTPException) as error:
                asyncio.run(read_validated_image_upload(upload(data, name, mime)))
            self.assertEqual(error.exception.status_code, status)

    def test_attachments_reuse_image_decode_validation_and_pdf_stays_compatible(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(read_validated_task_attachment(upload(b"\x89PNG\r\n\x1a\n")))
        self.assertEqual(error.exception.status_code, 400)
        pdf = b"%PDF-1.7\nsynthetic-test"
        result = asyncio.run(read_validated_task_attachment(upload(pdf, "test.pdf", "application/pdf")))
        self.assertEqual(result[0], pdf)


if __name__ == "__main__":
    unittest.main()
