# Start only Ray's synthetic preview service; never remove or reset a resource.
$ErrorActionPreference = 'Stop'
$composeFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'compose.postgres.yml'
$containerName = 'ray-postgres-preview-db-1'
$volumeName = 'ray-postgres_ray_preview_data'

$engine = docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $engine -ne 'linux') { throw 'Docker Linux engine is required.' }
$containers = @(docker ps -a --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker containers.' }
$volumes = @(docker volume ls --format '{{.Name}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker volumes.' }

if ($volumes -contains $volumeName) {
    $volume = docker volume inspect $volumeName | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $volume.Labels.'com.docker.compose.project' -ne 'ray-postgres' -or $volume.Labels.'com.docker.compose.volume' -ne 'ray_preview_data') {
        throw 'Refusing unexpected existing preview volume. Inspect ownership; do not delete or adopt it.'
    }
}
$running = $false
if ($containers -contains $containerName) {
    $container = docker inspect $containerName | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect preview container.' }
    $binding = @($container.HostConfig.PortBindings.'5432/tcp')
    $mount = @($container.Mounts | Where-Object { $_.Destination -eq '/var/lib/postgresql' })
    if ($container.Config.Labels.'com.docker.compose.project' -ne 'ray-postgres' -or
        $container.Config.Labels.'com.docker.compose.service' -ne 'preview-db' -or
        $container.Config.Image -ne 'postgis/postgis:18-3.6' -or
        $binding.Count -ne 1 -or $binding[0].HostIp -ne '127.0.0.1' -or $binding[0].HostPort -ne '55434' -or
        $mount.Count -ne 1 -or $mount[0].Name -ne $volumeName) {
        throw 'Refusing unexpected preview container/image/binding/mount. Inspect the conflict without deleting resources.'
    }
    $running = $container.State.Running
}
$listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 55434 })
if ($listeners.Count -gt 0 -and -not $running) {
    throw 'Port 55434 is occupied. No process was stopped and no alternate port selected.'
}
docker compose -f $composeFile --profile preview up -d --wait preview-db
if ($LASTEXITCODE -ne 0) { throw 'Preview database startup failed. No reset or cleanup was performed.' }
Write-Output 'Synthetic preview database ready on 127.0.0.1:55434; existing volume preserved.'
