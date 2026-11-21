"""PWA assets and routes without importing model weights or external services."""

import ast
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import struct
import unittest

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
PAGES = ("index", "identifyfur", "history", "about", "login", "profile")


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.manifest = []
        self.theme = []
        self.scripts = []
        self.in_script = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "manifest":
            self.manifest.append(attrs.get("href"))
        if tag == "meta" and attrs.get("name") == "theme-color":
            self.theme.append(attrs.get("content"))
        if tag == "script":
            self.in_script = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


def app_without_model_startup():
    source = ROOT / "backend/app/main.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    # The static route block does not need the ML models, database, or .env.
    block = next(n for n in tree.body if isinstance(n, ast.If) and
                 any(isinstance(child, ast.FunctionDef) and child.name == "serve_index"
                     for child in ast.walk(n)))
    namespace = dict(app=FastAPI(), FRONTEND_DIR=str(FRONTEND), os=os, re=re,
                     FileResponse=FileResponse, StaticFiles=StaticFiles,
                     HTTPException=HTTPException)
    exec(compile(ast.Module(body=[block], type_ignores=[]), str(source), "exec"), namespace)
    return TestClient(namespace["app"])


class PwaTests(unittest.TestCase):
    def test_root_resources_are_served_with_worker_scope(self):
        client = app_without_model_startup()
        worker = client.get("/sw.js")
        self.assertEqual(worker.status_code, 200)
        self.assertEqual(worker.headers["service-worker-allowed"], "/")
        self.assertIn("javascript", worker.headers["content-type"])
        manifest = client.get("/manifest.json")
        self.assertEqual(manifest.status_code, 200)
        self.assertEqual(manifest.json()["display"], "standalone")
        self.assertEqual(manifest.json()["start_url"], "/")

    def test_manifest_icons_are_real_pngs_of_the_declared_sizes(self):
        manifest = json.loads((FRONTEND / "manifest.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["theme_color"])
        self.assertTrue(manifest["background_color"])
        for size in (192, 512):
            icon = next(i for i in manifest["icons"] if i["sizes"] == f"{size}x{size}")
            self.assertEqual(icon["type"], "image/png")
            path = FRONTEND / icon["src"].lstrip("/")
            raw = path.read_bytes()
            self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", raw[16:24]), (size, size))

    def test_every_page_links_manifest_theme_and_registers_root_worker(self):
        for page in PAGES:
            with self.subTest(page=page):
                head = Head()
                head.feed((FRONTEND / f"{page}.html").read_text(encoding="utf-8"))
                self.assertIn("/manifest.json", head.manifest)
                self.assertTrue(head.theme)
                self.assertIn('navigator.serviceWorker.register("/sw.js")', "".join(head.scripts))


if __name__ == "__main__":
    unittest.main()
