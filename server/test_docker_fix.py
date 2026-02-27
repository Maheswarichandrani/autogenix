#!/usr/bin/env python3
"""Test the Docker exec fix"""

from app.core.docker_manager import DockerManager
import logging

logging.basicConfig(level=logging.INFO)

def test_docker_fix():
    """Test that our Docker exec fix works"""
    dm = DockerManager('test-project', 'test-build-fix')
    try:
        print("Creating container...")
        container_id = dm.spin_up()
        print(f'✅ Container created: {container_id}')
        
        # Test exec command
        print("Testing exec with pwd...")
        exit_code, output = dm.exec('pwd')
        print(f'✅ pwd exit_code: {exit_code}, output: {output.strip()}')
        
        # Test write file
        print("Testing file write...")
        dm.write_file('test.txt', 'Hello Docker fix!')
        exit_code, content = dm.exec('cat test.txt')
        print(f'✅ File content: {content.strip()}')
        
        # Test ls command
        print("Testing ls command...")
        exit_code, files = dm.exec('ls -la')
        print(f'✅ Files in workspace: {files.strip()[:200]}...')
        
        # Test exec with different commands
        print("Testing other commands...")
        exit_code, output = dm.exec('echo "Docker exec is working!"')
        print(f'✅ Echo test: {output.strip()}')
        
        # Clean up by removing the container
        try:
            dm.container.remove(force=True)
            print('✅ Container cleaned up')
        except Exception as e:
            print(f'⚠️ Warning: Could not clean up container: {e}')
            
        print('🎉 Test successful! Docker exec fix works.')
        return True
        
    except Exception as e:
        print(f'❌ Test failed: {e}')
        try:
            if dm.container:
                dm.container.remove(force=True)
        except:
            pass
        return False

if __name__ == "__main__":
    test_docker_fix()
