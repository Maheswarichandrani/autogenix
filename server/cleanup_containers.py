#!/usr/bin/env python3
"""
Check for orphaned Docker containers from previous builds
"""

import docker
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def check_orphaned_containers():
    """Check for orphaned build containers."""
    
    try:
        client = docker.from_env()
        containers = client.containers.list(all=True)
        
        build_containers = [c for c in containers if c.name.startswith("build-")]
        
        print(f"🔍 Found {len(build_containers)} build containers:")
        
        for container in build_containers:
            print(f"   📦 {container.name} - Status: {container.status}")
            
            if container.status in ["exited", "dead"]:
                print(f"      🧹 Removing orphaned container: {container.name}")
                try:
                    container.remove(force=True)
                    print(f"      ✅ Removed: {container.name}")
                except Exception as e:
                    print(f"      ❌ Failed to remove {container.name}: {e}")
        
        print(f"✅ Container cleanup complete")
        
    except Exception as e:
        print(f"❌ Failed to check containers: {e}")

if __name__ == "__main__":
    check_orphaned_containers()
