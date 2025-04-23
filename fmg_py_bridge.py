#!/usr/bin/env python3
# filepath: /home/maxwell/AgentMatrix/FMG/fmg_python_bridge.py
import subprocess
import json
import os
import time
import sys
from pathlib import Path
from typing import Dict, Any, Optional, Union, List


class FMGMapGenerator:
    """Python interface for calling Fantasy Map Generator's Node.js script to generate maps"""

    def __init__(self, fmg_dir: Optional[str] = None):
        """
        Initialize the FMG map generator

        Parameters:
            fmg_dir: Path to the FMG directory, if None, uses the current file's directory
        """
        # Determine the FMG directory path
        if fmg_dir is None:
            self.fmg_dir = Path(__file__).parent.absolute()
        else:
            self.fmg_dir = Path(fmg_dir)

        # Ensure entry.cjs file exists
        self.entry_path = self.fmg_dir / "entry.cjs"
        if not self.entry_path.exists():
            raise FileNotFoundError(
                f"Cannot find FMG's entry.cjs file: {self.entry_path}")

        # Download directory
        self.download_dir = self.fmg_dir / "downloads"
        os.makedirs(self.download_dir, exist_ok=True)

    def generate_map(self,
                     seed: Optional[str] = None,
                     heightmap: Optional[str] = None,
                     map_size: Optional[int] = None,
                     cultures_set: Optional[str] = None,
                     points: Optional[int] = None,
                     timeout: int = 300,
                     **kwargs) -> Dict[str, Any]:
        """
        Call FMG's entry.cjs to generate a map and return the result

        Parameters:
            seed: Map seed
            heightmap: Heightmap template (e.g., "highIsland", "continents", "archipelago")
            map_size: Map size percentage (1-100)
            cultures_set: Culture set (e.g., "european", "oriental", "african")
            points: Number of points/cells
            timeout: Script execution timeout in seconds
            **kwargs: Other parameters to pass to entry.cjs

        Returns:
            Dictionary containing map data and statistics
        """
        # Build command line arguments
        cmd = ["node", str(self.entry_path)]

        # Add parameters
        if seed is not None:
            cmd.append(f"--seed={seed}")
        if heightmap is not None:
            cmd.append(f"--heightmap={heightmap}")
        if map_size is not None:
            cmd.append(f"--mapSize={map_size}")
        if cultures_set is not None:
            cmd.append(f"--culturesSet={cultures_set}")
        if points is not None:
            cmd.append(f"--points={points}")

        # Add other parameters
        for key, value in kwargs.items():
            # Convert camelCase to command line arguments
            # For example, temperatureEquator becomes --temperatureEquator
            cmd.append(f"--{key}={value}")

        print(f"Executing command: {' '.join(cmd)}")

        # Record start time to track execution time
        start_time = time.time()

        # Execute command and capture output
        try:
            result = subprocess.run(
                cmd,
                cwd=self.fmg_dir,
                capture_output=True,
                text=True,
                timeout=timeout
            )
        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"FMG map generation timed out after {timeout} seconds")

        # Check if command succeeded
        if result.returncode != 0:
            error_msg = f"FMG map generation failed, return code: {result.returncode}\n"
            error_msg += f"Error output:\n{result.stderr}"
            raise RuntimeError(error_msg)

        # Parse output to get statistics
        stats = self._parse_map_stats(result.stdout)

        # Find map file from stats
        map_file = None
        if "file_path" in stats:
            # Remove .crdownload if present
            file_path_str = stats["file_path"].replace(".crdownload", "")
            map_file = Path(file_path_str)
            if not map_file.exists():
                raise FileNotFoundError(f"Map file does not exist: {map_file}")

        # Assemble and return result
        execution_time = time.time() - start_time
        return {
            "success": True,
            "stats": stats,
            # "map_data": map_data,
            "map_file": str(map_file) if map_file else None,
            "output": result.stdout,
            "error": result.stderr,
            "execution_time": execution_time,
            "command": " ".join(cmd)
        }

    def _parse_map_stats(self, output: str) -> Dict[str, Any]:
        """Parse map statistics from command output"""
        stats = {}
        stats_section = False
        download_info = {}

        # Iterate through output lines
        for line in output.splitlines():
            if line.strip() == "=== MAP STATISTICS ===":
                stats_section = True
                continue
            elif line.strip() == "=====================":
                stats_section = False
                continue
            elif "Download completed:" in line:
                download_info["file_name"] = line.split(":", 1)[1].strip()
            elif "JSON file successfully downloaded to:" in line:
                download_info["file_path"] = line.split(":", 1)[1].strip()

            if stats_section:
                parts = line.split(":", 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    value = parts[1].strip()

                    # Try to convert numerical values
                    if value.isdigit():
                        stats[key] = int(value)
                    elif value.replace(".", "", 1).isdigit():
                        stats[key] = float(value)
                    else:
                        stats[key] = value
        # remove `.crdownload` from downloaded file name
        if "file_name" in download_info:
            download_info["file_name"] = download_info["file_name"].replace(
                ".crdownload", "")

        if "file_path" in download_info:
            download_info["file_path"] = download_info["file_path"].replace(
                ".crdownload", "")
        # Add download information to statistics
        if download_info:
            stats.update(download_info)

        return stats


def main():
    """Command line entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description="Call Fantasy Map Generator through Python")
    parser.add_argument("--seed", help="Map seed")
    parser.add_argument("--heightmap", help="Heightmap template")
    parser.add_argument("--map-size", type=int,
                        help="Map size percentage (1-100)")
    parser.add_argument("--cultures-set", help="Culture set")
    parser.add_argument("--points", type=int, help="Number of points/cells")
    parser.add_argument("--temperature-equator", type=int,
                        help="Equator temperature")
    parser.add_argument("--timeout", type=int, default=300,
                        help="Timeout in seconds")

    args = parser.parse_args()

    # Prepare parameters
    kwargs = {}
    if args.temperature_equator is not None:
        kwargs["temperatureEquator"] = args.temperature_equator

    # Initialize generator and generate map
    try:
        generator = FMGMapGenerator()
        result = generator.generate_map(
            seed=args.seed,
            heightmap=args.heightmap,
            map_size=args.map_size,
            cultures_set=args.cultures_set,
            points=args.points,
            timeout=args.timeout,
            **kwargs
        )

        # Output results
        print("\n=== Generation Results ===")
        print(f"Success: {result['success']}")
        print(f"Map file: {result['map_file']}")
        print(f"Execution time: {result['execution_time']:.2f} seconds")

        # Output statistics
        if result['stats']:
            print("\n=== Map Statistics ===")
            for key, value in result['stats'].items():
                print(f"{key}: {value}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
