"""Offline tests of the real route/helper without app startup or .env access."""

import ast
import io
from pathlib import Path
from typing import Optional
import unittest
from unittest.mock import Mock, patch

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image


def load_prediction_code():
    # Startup loads credentials, connects clients, and loads/downloads AI weights.
    # Compile only the unchanged production function bodies to avoid those effects.
    path = Path(__file__).resolve().parents[1] / "backend/app/main.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    functions = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name in ("verify_turnstile", "predict")
    ]
    namespace = {
        "app": FastAPI(), "File": File, "Form": Form, "Header": Header,
        "HTTPException": HTTPException, "UploadFile": UploadFile,
        "Optional": Optional, "httpx": httpx, "io": io, "Image": Image,
        "CLOUDFLARE_SECRET_KEY": "offline-test-secret",
        "MAX_UPLOAD_BYTES": 10 * 1024 * 1024,
        "VALID_SCAN_SOURCES": ("Camera", "Upload"),
        "resolve_user_id": Mock(return_value="test-user"),
    }
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), "exec"), namespace)
    return namespace


class TurnstileTests(unittest.TestCase):
    def setUp(self):
        self.code = load_prediction_code()
        self.client = TestClient(self.code["app"])

    def submit(self, token=None):
        data = {} if token is None else {"cf_turnstile_response": token}
        return self.client.post(
            "/api/predict", data=data,
            files={"file": ("test.jpg", b"not-an-image", "image/jpeg")},
        )

    def cloudflare_response(self, payload, status=200):
        return httpx.Response(
            status, json=payload,
            request=httpx.Request("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify"),
        )

    def test_missing_token_is_rejected_before_user_or_image_processing(self):
        with patch.object(httpx, "post") as post:
            response = self.submit()
        self.assertEqual(response.status_code, 403)
        self.code["resolve_user_id"].assert_not_called()
        post.assert_not_called()

    def test_blank_token_is_rejected_without_cloudflare_request(self):
        with patch.object(httpx, "post") as post:
            response = self.submit("   ")
        self.assertEqual(response.status_code, 403)
        post.assert_not_called()

    def test_invalid_expired_and_reused_tokens_are_rejected(self):
        for error in ("invalid-input-response", "timeout-or-duplicate"):
            with self.subTest(error=error):
                with patch.object(httpx, "post", return_value=self.cloudflare_response(
                    {"success": False, "error-codes": [error]}
                )):
                    response = self.submit("rejected-token")
                self.assertEqual(response.status_code, 403)
        self.code["resolve_user_id"].assert_not_called()

    def test_valid_token_reaches_existing_image_validation(self):
        with patch.object(httpx, "post", return_value=self.cloudflare_response(
            {"success": True}
        )) as post:
            response = self.submit("fresh-token")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "error", "message": "Invalid image file uploaded."
        })
        self.assertEqual(post.call_args.kwargs["data"], {
            "secret": "offline-test-secret", "response": "fresh-token",
        })

    def test_missing_secret_fails_closed(self):
        self.code["CLOUDFLARE_SECRET_KEY"] = None
        with patch.object(httpx, "post") as post:
            response = self.submit("fresh-token")
        self.assertEqual(response.status_code, 403)
        post.assert_not_called()

    def test_cloudflare_timeout_fails_closed(self):
        with patch.object(httpx, "post", side_effect=httpx.TimeoutException("offline timeout")):
            response = self.submit("fresh-token")
        self.assertEqual(response.status_code, 403)

    def test_non_boolean_success_is_not_accepted(self):
        with patch.object(httpx, "post", return_value=self.cloudflare_response(
            {"success": "false"}
        )):
            self.assertIs(self.code["verify_turnstile"]("token"), False)

    def test_http_error_is_not_accepted_even_with_success_payload(self):
        with patch.object(httpx, "post", return_value=self.cloudflare_response(
            {"success": True}, status=503
        )):
            self.assertIs(self.code["verify_turnstile"]("token"), False)

    def test_malformed_response_fails_closed(self):
        with patch.object(httpx, "post", return_value=self.cloudflare_response([])):
            self.assertIs(self.code["verify_turnstile"]("token"), False)


if __name__ == "__main__":
    unittest.main()
