"""Seed the Pinecone index with CVE and threat intelligence data."""

import json
import os
import sys

from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from pinecone import Pinecone, ServerlessSpec


def seed():
    load_dotenv()

    api_key = os.environ.get("PINECONE_API_KEY")
    if not api_key:
        print("Error: PINECONE_API_KEY not set in environment")
        sys.exit(1)

    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("Error: OPENAI_API_KEY not set in environment")
        sys.exit(1)

    pc = Pinecone(api_key=api_key)
    index_name = os.getenv("PINECONE_INDEX_NAME", "neuralwarden-threat-intel")

    # Create index if it doesn't exist
    existing = [idx.name for idx in pc.list_indexes()]
    if index_name not in existing:
        pc.create_index(
            name=index_name,
            dimension=1536,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        print(f"Created index: {index_name}")
    else:
        print(f"Index '{index_name}' already exists")

    index = pc.Index(index_name)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    # Load seed data
    seed_path = os.path.join(os.path.dirname(__file__), "..", "data", "cve_seeds.json")
    with open(seed_path) as f:
        seeds = json.load(f)

    # Embed and upsert in batches
    batch_size = 50
    for i in range(0, len(seeds), batch_size):
        batch = seeds[i : i + batch_size]
        texts = [s["text"] for s in batch]
        vectors = embeddings.embed_documents(texts)
        upserts = [
            {
                "id": s["id"],
                "values": v,
                "metadata": {**s["metadata"], "text": s["text"]},
            }
            for s, v in zip(batch, vectors)
        ]
        index.upsert(vectors=upserts)
        print(f"Upserted {len(upserts)} vectors (batch {i // batch_size + 1})")

    print(f"\nSeeded {len(seeds)} entries into '{index_name}'")


if __name__ == "__main__":
    seed()
