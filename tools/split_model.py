#!/usr/bin/env python3
"""
Utility to split model.bin into chunks for parallel downloading and CDN limit bypass.
"""
import os
import sys
import json
import math

DEFAULT_CHUNK_SIZE = 20 * 1024 * 1024  # 20 MB per chunk (Cloudflare Pages limit is 25MB)

def split_model(input_path, output_dir, chunk_size=DEFAULT_CHUNK_SIZE):
    if not os.path.exists(input_path):
        print(f"Error: input file {input_path} not found")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)
    total_size = os.path.getsize(input_path)
    chunk_count = math.ceil(total_size / chunk_size)

    print(f"Splitting {input_path} ({total_size / 1024 / 1024:.2f} MB) into {chunk_count} chunks of ~{chunk_size / 1024 / 1024:.1f} MB...")

    manifest = {
        "version": "1.0.0",
        "magic": "STT1",
        "totalSize": total_size,
        "chunkSize": chunk_size,
        "chunkCount": chunk_count,
        "chunks": []
    }

    with open(input_path, "rb") as f_in:
        # Verify magic header
        magic = f_in.read(4)
        if magic != b"STT1":
            print(f"Error: invalid STT1 magic: {magic}")
            sys.exit(1)
        f_in.seek(0)

        offset = 0
        for i in range(chunk_count):
            chunk_filename = f"model.bin.{i}"
            chunk_filepath = os.path.join(output_dir, chunk_filename)
            data = f_in.read(chunk_size)
            actual_chunk_size = len(data)

            with open(chunk_filepath, "wb") as f_out:
                f_out.write(data)

            manifest["chunks"].append({
                "name": chunk_filename,
                "size": actual_chunk_size,
                "offset": offset
            })
            print(f"  Created chunk {i}: {chunk_filename} ({actual_chunk_size / 1024 / 1024:.2f} MB)")
            offset += actual_chunk_size

    manifest_path = os.path.join(output_dir, "model.json")
    with open(manifest_path, "w", encoding="utf-8") as f_manifest:
        json.dump(manifest, f_manifest, indent=2)

    print(f"Manifest created: {manifest_path}")
    print("Done! All chunks successfully generated.")

if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "apps/showcase/public/model.bin"
    dst = sys.argv[2] if len(sys.argv) > 2 else "apps/showcase/public/model_chunks"
    split_model(src, dst)
