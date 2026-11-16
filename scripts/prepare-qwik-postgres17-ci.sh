#!/usr/bin/env bash
# Disposable GitHub VM only; never an application/production setup procedure.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux && $(id -u) != 0 ]]
[[ -n "${RUNNER_TEMP:-}" && -d "$RUNNER_TEMP" && "${GITHUB_WORKSPACE:-}" == "$PWD" ]]
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_CODENAME" == noble ]]

temporary=$(mktemp -d "$RUNNER_TEMP/qwik-pg17-provision.XXXXXX")
key="$temporary/pgdg.asc"
curl --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 30 \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc --output "$key"
fingerprint=$(gpg --batch --show-keys --with-colons "$key" | awk -F: '$1=="fpr" {print $10;exit}')
[[ "$fingerprint" == B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8 ]]
sudo install -m 0644 "$key" /usr/share/keyrings/socius-qwik-pgdg.asc
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/socius-qwik-pgdg.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' \
  > "$temporary/pgdg.list"
# Use this same isolated source set for ALL APT operations. Do not add a second
# global PGDG source with a conflicting Signed-By to the runner's configuration.
sources=(-o "Dir::Etc::sourcelist=$temporary/pgdg.list" -o Dir::Etc::sourceparts=- -o APT::Get::List-Cleanup=0)

# Explicitly prevent a package-created main cluster. The tests start/stop only
# their own nonroot initdb cluster, private Unix socket, listen_addresses=''.
config="$temporary/config"
mkdir -m 0700 "$config"
printf 'create_main_cluster = false\nstart_conf = manual\n' > "$config/createcluster.conf"
[[ ! -d /etc/postgresql/17/main ]]
sudo apt-get "${sources[@]}" \
  -o Acquire::Retries=0 -o Acquire::https::Timeout=30 update
candidate=$(apt-cache "${sources[@]}" policy postgresql-17 | awk '/Candidate:/ {print $2;exit}')
[[ "$candidate" == 17.* && "$candidate" != *[[:space:]]* ]]
sudo env PGSYSCONFDIR="$config" DEBIAN_FRONTEND=noninteractive \
  apt-get "${sources[@]}" -y --no-install-recommends -o Acquire::Retries=0 -o Acquire::https::Timeout=30 \
  install "postgresql-17=$candidate" "postgresql-client-17=$candidate"
[[ ! -d /etc/postgresql/17/main ]]
/usr/lib/postgresql/17/bin/postgres --version
dpkg-query --show --showformat='${Package} ${Version}\n' postgresql-17 postgresql-client-17
sha256sum /usr/lib/postgresql/17/bin/postgres /usr/lib/postgresql/17/bin/psql
