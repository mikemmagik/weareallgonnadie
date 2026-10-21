#!/usr/bin/env python3
"""Cross-language PublicationIntent v2 hash vectors; standard library only."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


FIXTURES = Path(__file__).with_name("fixtures")


def hash_document(intent: dict[str, Any]) -> dict[str, Any]:
    """Match Site publicationIntentHashDocument() in its documented wire order."""

    editorial = intent["editorial"]
    trusted = editorial["trusted_publisher"]
    return {
        "version": intent["version"],
        "intent_id": intent["intent_id"],
        "origin": intent["origin"],
        "authorization": {
            "kind": intent["authorization"]["kind"],
            "approved": intent["authorization"]["approved"],
        },
        "editorial": {
            "decision_id": editorial["decision_id"],
            "source_event_id": editorial["source_event_id"],
            "source_attribution": editorial["source_attribution"],
            "approved_at": editorial["approved_at"],
            "publication_policy": {
                "version": editorial["publication_policy"]["version"],
                "outcome": editorial["publication_policy"]["outcome"],
            },
            "review_route": editorial["review_route"],
            "trusted_publisher": None
            if trusted is None
            else {
                "publisher_id": trusted["publisher_id"],
                "publisher_name": trusted["publisher_name"],
                "trusted_rss_url": trusted["trusted_rss_url"],
                "article_url": trusted["article_url"],
                "article_host": trusted["article_host"],
                "verified_at": trusted["verified_at"],
                "safety_gates": {
                    "publisher_identity": trusted["safety_gates"]["publisher_identity"],
                    "safe_retrieval": trusted["safety_gates"]["safe_retrieval"],
                    "sensitive_content": trusted["safety_gates"]["sensitive_content"],
                },
            },
        },
        "post": {
            key: intent["post"][key]
            for key in (
                "type",
                "url",
                "canonical_url",
                "source_item_id",
                "title",
                "source",
                "origin",
                "preview",
                "embed",
                "body",
                "references",
            )
        },
    }


def fixture_hash(intent: dict[str, Any]) -> str:
    encoded = json.dumps(
        hash_document(intent), ensure_ascii=False, allow_nan=False, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def main() -> None:
    names = (
        "publication-intent-v2-trusted-publisher.json",
        "publication-intent-v2-independently-verified.json",
    )
    for name in names:
        intent = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
        if intent.get("version") != 2:
            raise SystemExit(f"{name}: expected v2")
        actual = fixture_hash(intent)
        if actual != intent.get("content_hash"):
            raise SystemExit(f"{name}: content_hash mismatch")
    print("PublicationIntent v2 Python hash vectors: PASS")


if __name__ == "__main__":
    main()
