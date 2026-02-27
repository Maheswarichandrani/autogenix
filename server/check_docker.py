#!/usr/bin/env python3
"""
Docker Health Check Script

Run this to diagnose Docker issues when you get 404 errors during file operations.
"""

import docker
import logging
import sys
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
log = logging.getLogger(__name__)

def check_docker_health():
    """Check Docker daemon connectivity and basic functionality."""
    
    print("🔍 Docker Health Check")
    print("=" * 50)
    
    try:
        # 1. Check Docker client connectivity
        print("1. Testing Docker client connection...")
        client = docker.from_env()
        info = client.info()
        print(f"   ✅ Connected to Docker daemon")
        print(f"   📊 Containers: {info.get('Containers', 'unknown')}")
        print(f"   📊 Images: {info.get('Images', 'unknown')}")
        print(f"   📊 Docker version: {info.get('ServerVersion', 'unknown')}")
        
    except Exception as e:
        print(f"   ❌ Failed to connect to Docker: {e}")
        return False
    
    try:
        # 2. Check Docker base image availability
        print(f"\n2. Checking base image availability...")
        base_image = getattr(settings, 'DOCKER_BASE_IMAGE', 'python:3.11-slim')
        print(f"   Base image: {base_image}")
        
        try:
            client.images.get(base_image)
            print(f"   ✅ Base image found locally")
        except docker.errors.ImageNotFound:
            print(f"   ⚠️ Base image not found locally, will pull on first use")
        
    except Exception as e:
        print(f"   ❌ Error checking base image: {e}")
    
    try:
        # 3. Test container creation and basic operations
        print(f"\n3. Testing container operations...")
        
        test_container_name = "nexus-health-check"
        
        # Clean up any existing test container
        try:
            existing = client.containers.get(test_container_name)
            existing.remove(force=True)
            print("   🧹 Cleaned up existing test container")
        except docker.errors.NotFound:
            pass
        
        # Create test container
        container = client.containers.run(
            image=base_image,
            name=test_container_name,
            command="sleep 30",
            detach=True,
            remove=True,  # Auto-remove when stopped
        )
        print(f"   ✅ Created test container: {container.short_id}")
        
        # Test file write operation
        import io, tarfile
        
        test_content = "Hello from NexusAI health check!\n"
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as tar:
            encoded = test_content.encode("utf-8")
            info = tarfile.TarInfo(name="test.txt")
            info.size = len(encoded)
            tar.addfile(info, io.BytesIO(encoded))
        stream.seek(0)
        
        container.put_archive("/tmp", stream)
        print("   ✅ File write operation successful")
        
        # Test command execution
        result = container.exec_run(["cat", "/tmp/test.txt"])
        if result.exit_code == 0 and test_content in result.output.decode():
            print("   ✅ Command execution successful")
        else:
            print(f"   ⚠️ Command execution issues: exit_code={result.exit_code}")
        
        # Clean up
        container.stop()
        print("   🧹 Test container cleaned up")
        
        print(f"\n🎉 Docker health check PASSED!")
        return True
        
    except Exception as e:
        print(f"   ❌ Container operations failed: {e}")
        
        # Try to clean up
        try:
            container = client.containers.get(test_container_name)
            container.remove(force=True)
        except:
            pass
            
        return False

if __name__ == "__main__":
    success = check_docker_health()
    
    if not success:
        print(f"\n💡 Troubleshooting tips:")
        print("   • Make sure Docker Desktop is running")
        print("   • Check Docker daemon logs for errors")
        print("   • Restart Docker Desktop if needed")
        print("   • Ensure your user has Docker permissions")
        print("   • On Windows, ensure WSL2 is properly configured")
        sys.exit(1)
    else:
        print(f"\n✅ Docker is healthy and ready for NexusAI builds!")
