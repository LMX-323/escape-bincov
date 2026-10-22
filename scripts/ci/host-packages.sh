#!/usr/bin/env bash
# Host packages for the browser jobs on ubuntu-24.04 runners, without apt mirrors on the critical path.
# Azure's Ubuntu mirror sometimes serves packages at a few kB/s, and apt keeps waiting on it
# (actions/runner-images#14823, #15040); on 2026-10-22 one job spent 26 minutes installing fonts.
#
#   cache-label      print the part of the cache key that depends on this runner (its Mesa build)
#   fetch <dir>      put every pinned font .deb, and lavapipe if the runner lacks it, into <dir>
#   install <dir>    install them from <dir> without downloading, then check fontconfig and the Vulkan driver
#
# Fonts come from fonts-noble.lock with fixed SHA-256 sums. lavapipe (mesa-vulkan-drivers) must match the
# runner's own Mesa build, so its sum comes from the runner's apt lists or, failing that, Ubuntu's HTTPS index.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
lock="$here/fonts-noble.lock"
icd_dir=/usr/share/vulkan/icd.d
mirrors=(https://archive.ubuntu.com/ubuntu https://mirrors.edge.kernel.org/ubuntu http://azure.archive.ubuntu.com/ubuntu)

entries() { grep -v -e '^#' -e '^[[:space:]]*$' "$lock"; }
have_lavapipe() { compgen -G "$icd_dir/lvp_icd*.json" > /dev/null; }

mesa_version() {
  local package status version
  for package in libgl1-mesa-dri libgbm1; do
    status='' version=''
    read -r status version < <(dpkg-query -W -f='${db:Status-Status} ${Version}\n' "$package" 2> /dev/null) || true
    if [ "$status" = installed ] && [ -n "$version" ]; then echo "$version"; return 0; fi
  done
  echo "::error::Cannot find the runner's Mesa version" >&2
  return 1
}

# download <sha256> <file> <url>... : the first URL that delivers the right bytes wins. apt has no
# minimum-throughput setting, curl does: a source slower than 300 kB/s for 15 s is abandoned.
download() {
  local sha=$1 file=$2 url round
  shift 2
  for round in 1 2; do
    for url in "$@"; do
      if curl --fail --location --silent --show-error --connect-timeout 10 --max-time 300 \
          --speed-limit 300000 --speed-time 15 --output "$file.part" "$url" &&
        echo "$sha  $file.part" | sha256sum --check --status; then
        mv "$file.part" "$file"
        return 0
      fi
      echo "::warning::${file##*/} from $url failed (round $round): slow, missing or wrong checksum" >&2
      rm -f "$file.part"
    done
  done
  echo "::error::Cannot fetch ${file##*/}" >&2
  return 1
}

# Print "<sha256> <pool path>" for mesa-vulkan-drivers=<version>, as apt would download it.
lavapipe_record() {
  local version=$1 record='' pocket component
  record=$(apt-cache show "mesa-vulkan-drivers=$version" 2> /dev/null |
    awk '/^SHA256:/{s=$2} /^Filename:/{f=$2} END{if (s && f) print s, f}') || true
  for pocket in noble-updates noble-security noble; do
    [ -n "$record" ] && break
    for component in main universe; do
      record=$(curl --fail --silent --location --max-time 120 \
          "https://archive.ubuntu.com/ubuntu/dists/$pocket/$component/binary-amd64/Packages.gz" | gzip -dc |
        awk -v v="$version" 'BEGIN { RS = "" }
          /(^|\n)Package: mesa-vulkan-drivers\n/ && index($0, "\nVersion: " v "\n") {
            match($0, /\nSHA256: [0-9a-f]+/); s = substr($0, RSTART + 9, RLENGTH - 9)
            match($0, /\nFilename: [^\n]+/); f = substr($0, RSTART + 11, RLENGTH - 11); print s, f; exit }') || true
      [ -n "$record" ] && break
    done
  done
  if [ -z "$record" ]; then
    echo "::error::No package index lists mesa-vulkan-drivers $version" >&2
    return 1
  fi
  echo "$record"
}

mirror_urls() { local mirror; for mirror in "${mirrors[@]}"; do echo "$mirror/$1"; done; }

# dpkg, not `apt-get install ./file.deb`: apt swaps a local file for the archive copy of the same version and
# downloads it. Dependencies normally come with the image; one missing from a future image is fetched by apt, visibly.
install_files() {
  local attempt
  for attempt in 1 2 3; do
    sudo dpkg -i "$@" && return 0
    if sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock > /dev/null 2>&1; then
      echo "dpkg is busy with another package manager (attempt $attempt); retrying in 30 s" >&2
      sleep 30
      continue
    fi
    echo "::warning::A dependency of the pinned packages is not on this runner image; apt downloads it" >&2
    sudo apt-get install --yes --fix-broken --no-install-recommends -o DPkg::Lock::Timeout=120
    return
  done
  return 1
}

case "${1:-}" in
  cache-label)
    if have_lavapipe; then
      echo lavapipe-preinstalled
    else
      version=$(mesa_version)
      echo "mesa-$version"
    fi
    ;;
  fetch)
    dir=${2:?Usage: host-packages.sh fetch <dir>}
    mkdir -p "$dir/fonts"
    while read -r sha path _; do
      file="$dir/fonts/${path##*/}"
      if [ -f "$file" ] && echo "$sha  $file" | sha256sum --check --status; then continue; fi
      mapfile -t urls < <(mirror_urls "$path")
      download "$sha" "$file" "${urls[@]}"
    done < <(entries)
    if ! have_lavapipe; then
      version=$(mesa_version)
      record=$(lavapipe_record "$version")
      read -r sha path <<< "$record"
      mkdir -p "$dir/lavapipe"
      file="$dir/lavapipe/${path##*/}"
      if ! { [ -f "$file" ] && echo "$sha  $file" | sha256sum --check --status; }; then
        mapfile -t urls < <(mirror_urls "$path")
        # Launchpad keeps superseded builds, so an image a week behind the archive still finds its version.
        urls+=("https://launchpad.net/ubuntu/+archive/primary/+files/${path##*/}")
        download "$sha" "$file" "${urls[@]}"
      fi
    fi
    ;;
  install)
    dir=${2:?Usage: host-packages.sh install <dir>}
    dir=$(cd "$dir" && pwd)
    files=()
    while read -r sha path _; do
      files+=("$dir/fonts/${path##*/}")
      echo "$sha  $dir/fonts/${path##*/}" | sha256sum --check --quiet
    done < <(entries)
    if ! have_lavapipe; then
      shopt -s nullglob
      drivers=("$dir"/lavapipe/mesa-vulkan-drivers_*.deb)
      [ "${#drivers[@]}" = 1 ] || { echo "::error::Expected one cached mesa-vulkan-drivers package" >&2; exit 1; }
      files+=("${drivers[0]}")
    fi
    install_files "${files[@]}"
    while read -r _ _ package_version; do
      package=${package_version%%=*} expected=${package_version#*=}
      actual=$(dpkg-query -W -f='${Version}' "$package")
      [ "$actual" = "$expected" ] || { echo "::error::$package is $actual, expected $expected" >&2; exit 1; }
    done < <(entries)
    fc-list | grep -qi 'Noto Sans CJK' || { echo "::error::fontconfig does not see Noto Sans CJK" >&2; exit 1; }
    have_lavapipe || { echo "::error::No lavapipe driver in $icd_dir" >&2; exit 1; }
    echo "Installed $(entries | wc -l) pinned font packages; Vulkan drivers: $(cd "$icd_dir" && echo ./*.json)"
    ;;
  *)
    echo "Usage: host-packages.sh cache-label | fetch <dir> | install <dir>" >&2
    exit 2
    ;;
esac
