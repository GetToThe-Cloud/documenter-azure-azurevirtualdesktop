<#
.SYNOPSIS
    Azure Virtual Desktop Inventory Collection Module
.DESCRIPTION
    Collects comprehensive inventory data from Azure Virtual Desktop environments
.AUTHOR
    Alex ter Neuzen - https://www.gettothe.cloud
.LINK
    https://www.gettothe.cloud
#>

function Test-Prerequisites {
    [CmdletBinding()]
    param(
        [switch]$UpdateModules
    )
    
    Write-Host "`n🔍 Checking Prerequisites..." -ForegroundColor Cyan
    
    # Check PowerShell Version
    Write-Host "  ○ Checking PowerShell version..." -ForegroundColor Gray
    $psVersion = $PSVersionTable.PSVersion
    
    if ($psVersion.Major -lt 7) {
        Write-Host "  ✗ PowerShell 7 or higher is required" -ForegroundColor Red
        Write-Host "    Current version: $($psVersion.ToString())" -ForegroundColor Yellow
        Write-Host "    Download PowerShell 7+: https://github.com/PowerShell/PowerShell/releases" -ForegroundColor Yellow
        return $false
    }
    
    Write-Host "  ✓ PowerShell version: $($psVersion.ToString())" -ForegroundColor Green
    
    # Define required modules
    $requiredModules = @(
        @{ Name = 'Az.Accounts'; MinVersion = '2.0.0' }
        @{ Name = 'Az.DesktopVirtualization'; MinVersion = '4.0.0' }
        @{ Name = 'Az.Compute'; MinVersion = '5.0.0' }
        @{ Name = 'Az.Network'; MinVersion = '5.0.0' }
        @{ Name = 'Az.Resources'; MinVersion = '6.0.0' }
    )
    
    Write-Host "  ○ Checking required Azure modules..." -ForegroundColor Gray
    $missingModules = @()
    $outdatedModules = @()
    
    foreach ($module in $requiredModules) {
        $installed = Get-Module -ListAvailable -Name $module.Name | Sort-Object Version -Descending | Select-Object -First 1
        
        if (-not $installed) {
            Write-Host "  ✗ Module $($module.Name) is not installed" -ForegroundColor Red
            $missingModules += $module
        } else {
            $installedVersion = $installed.Version
            $minVersion = [version]$module.MinVersion
            
            if ($installedVersion -lt $minVersion) {
                Write-Host "  ⚠ Module $($module.Name) version $installedVersion is below minimum $minVersion" -ForegroundColor Yellow
                $outdatedModules += $module
            } else {
                # Check if there's a newer version available online
                try {
                    $online = Find-Module -Name $module.Name -ErrorAction SilentlyContinue
                    if ($online -and $online.Version -gt $installedVersion) {
                        Write-Host "  ⚠ Module $($module.Name) version $installedVersion (newer version $($online.Version) available)" -ForegroundColor Yellow
                        $outdatedModules += $module
                    } else {
                        Write-Host "  ✓ Module $($module.Name) version $installedVersion" -ForegroundColor Green
                    }
                } catch {
                    # If we can't check online, just report installed version
                    Write-Host "  ✓ Module $($module.Name) version $installedVersion" -ForegroundColor Green
                }
            }
        }
    }
    
    # Install missing modules
    if ($missingModules.Count -gt 0) {
        Write-Host "`n  ℹ️  Missing modules detected. Attempting to install..." -ForegroundColor Cyan
        foreach ($module in $missingModules) {
            try {
                Write-Host "    ○ Installing $($module.Name)..." -ForegroundColor Gray
                Install-Module -Name $module.Name -MinimumVersion $module.MinVersion -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
                Write-Host "    ✓ Successfully installed $($module.Name)" -ForegroundColor Green
            } catch {
                Write-Host "    ✗ Failed to install $($module.Name): $($_.Exception.Message)" -ForegroundColor Red
                return $false
            }
        }
    }
    
    # Ask before updating modules unless the switch explicitly requested it.
    $shouldUpdateModules = $UpdateModules
    if (-not $UpdateModules -and $outdatedModules.Count -gt 0) {
        $updateAnswer = Read-Host "`n  Do you want to update the outdated modules now? (Y/N)"
        $shouldUpdateModules = $updateAnswer -match '^(?i:y|yes)$'
    }

    # Update outdated modules
    if ($shouldUpdateModules -and $outdatedModules.Count -gt 0) {
        Write-Host "`n  ℹ️  Updating outdated modules..." -ForegroundColor Cyan
        foreach ($module in $outdatedModules) {
            try {
                Write-Host "    ○ Updating $($module.Name)..." -ForegroundColor Gray
                Update-Module -Name $module.Name -Force -ErrorAction Stop
                Write-Host "    ✓ Successfully updated $($module.Name)" -ForegroundColor Green
            } catch {
                Write-Host "    ⚠ Failed to update $($module.Name): $($_.Exception.Message)" -ForegroundColor Yellow
                Write-Host "    ○ Continuing with installed version..." -ForegroundColor Gray
            }
        }
    } elseif ($outdatedModules.Count -gt 0) {
        Write-Host "`n  ℹ️  Outdated modules were not updated." -ForegroundColor Cyan
    }
    
    Write-Host "`n✓ All prerequisites met!`n" -ForegroundColor Green
    return $true
}

function Get-AVDEnabledSubscriptions {
    [CmdletBinding()]
    param()

    return @(Get-AzSubscription -ErrorAction Stop | Where-Object { $_.State -eq 'Enabled' })
}

function Resolve-AVDSubscriptionSelection {
    [CmdletBinding()]
    param(
        [AllowEmptyCollection()]
        [string[]]$SubscriptionIds
    )

    $availableSubscriptions = @(Get-AVDEnabledSubscriptions)
    if (-not $PSBoundParameters.ContainsKey('SubscriptionIds')) {
        return $availableSubscriptions
    }

    $requestedIds = @(
        @($SubscriptionIds) | ForEach-Object {
            if ($_ -isnot [string]) {
                throw [ArgumentException]::new('Subscription IDs must be strings.')
            }

            if (-not [string]::IsNullOrWhiteSpace($_)) {
                $_.Trim()
            }
        } | Select-Object -Unique
    )

    if ($requestedIds.Count -eq 0) {
        throw [ArgumentException]::new('At least one enabled subscription must be selected.')
    }

    $availableById = @{}
    foreach ($subscription in $availableSubscriptions) {
        $availableById[[string]$subscription.Id] = $subscription
    }

    $unknownIds = @($requestedIds | Where-Object { -not $availableById.ContainsKey($_) })
    if ($unknownIds.Count -gt 0) {
        throw [ArgumentException]::new('One or more selected subscriptions are not enabled or are not accessible.')
    }

    return @($requestedIds | ForEach-Object { $availableById[$_] })
}

function Get-AVDSubscriptionScope {
    [CmdletBinding()]
    param()

    $subscriptions = @(Get-AVDEnabledSubscriptions)
    return @($subscriptions | ForEach-Object {
        [ordered]@{
            id = [string]$_.Id
            name = [string]$_.Name
            tenantId = [string]$_.TenantId
            state = [string]$_.State
            scanEligible = $true
        }
    })
}

function Get-AVDPropertyValue {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$InputObject,
        [Parameter(Mandatory)]
        [string[]]$Names
    )

    if ($null -eq $InputObject) {
        return $null
    }

    foreach ($name in $Names) {
        if ($InputObject -is [System.Collections.IDictionary] -and $InputObject.Contains($name)) {
            return $InputObject[$name]
        }

        $property = $InputObject.PSObject.Properties | Where-Object { $_.Name -eq $name } | Select-Object -First 1
        if ($property) {
            return $property.Value
        }
    }

    return $null
}

function Convert-AVDKeyVaultReference {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$Reference
    )

    if ($null -eq $Reference) {
        return $null
    }

    $referenceUri = if ($Reference -is [string]) {
        [string]$Reference
    } else {
        Get-AVDPropertyValue -InputObject $Reference -Names @('keyVaultSecretUri', 'usernameKeyVaultSecretUri', 'passwordKeyVaultSecretUri', 'keyVaultUri', 'secretUri', 'secretUriWithVersion', 'uri')
    }

    if ([string]::IsNullOrWhiteSpace([string]$referenceUri)) {
        return $null
    }

    try {
        $parsedUri = [Uri]$referenceUri
    }
    catch {
        return $null
    }

    if (-not $parsedUri.IsAbsoluteUri -or $parsedUri.Scheme -ne 'https' -or $parsedUri.AbsolutePath -notmatch '(?i)/secrets/') {
        return $null
    }

    $vaultName = if ($Reference -is [string]) {
        $null
    } else {
        Get-AVDPropertyValue -InputObject $Reference -Names @('vaultName', 'keyVaultName')
    }
    $secretName = if ($Reference -is [string]) {
        $null
    } else {
        Get-AVDPropertyValue -InputObject $Reference -Names @('secretName')
    }
    $secretVersion = if ($Reference -is [string]) {
        $null
    } else {
        Get-AVDPropertyValue -InputObject $Reference -Names @('secretVersion', 'version')
    }

    $pathSegments = @($parsedUri.AbsolutePath.Trim('/') -split '/')
    $secretSegmentIndex = -1
    for ($index = 0; $index -lt $pathSegments.Count; $index++) {
        if ($pathSegments[$index] -ieq 'secrets') {
            $secretSegmentIndex = $index
            break
        }
    }

    if ([string]::IsNullOrWhiteSpace([string]$vaultName)) {
        $vaultName = $parsedUri.Host -replace '(?i)\.vault\..+$', ''
    }
    if ([string]::IsNullOrWhiteSpace([string]$secretName) -and $secretSegmentIndex -ge 0 -and $pathSegments.Count -gt ($secretSegmentIndex + 1)) {
        $secretName = [Uri]::UnescapeDataString($pathSegments[$secretSegmentIndex + 1])
    }
    if ([string]::IsNullOrWhiteSpace([string]$secretVersion) -and $secretSegmentIndex -ge 0 -and $pathSegments.Count -gt ($secretSegmentIndex + 2)) {
        $secretVersion = [Uri]::UnescapeDataString($pathSegments[$secretSegmentIndex + 2])
    }

    return [ordered]@{
        configured = $true
        keyVaultUri = [string]$referenceUri
        vaultName = $vaultName
        secretName = $secretName
        secretVersion = $secretVersion
    }
}

function Convert-AVDSessionHostConfigurationData {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Resource,
        [Parameter(Mandatory)]
        [ValidateSet('cmdlet', 'arm')]
        [string]$Source
    )

    $properties = Get-AVDPropertyValue -InputObject $Resource -Names @('properties')
    if ($null -eq $properties) {
        $properties = $Resource
    }

    $imageInfo = Get-AVDPropertyValue -InputObject $properties -Names @('imageInfo', 'image')
    $marketplaceInfo = Get-AVDPropertyValue -InputObject $properties -Names @('marketplaceImageInfo', 'marketplaceInfo', 'marketplaceImage')
    if ($null -eq $marketplaceInfo -and $null -ne $imageInfo) {
        $marketplaceInfo = Get-AVDPropertyValue -InputObject $imageInfo -Names @('marketplaceImageInfo', 'marketplaceInfo', 'marketplaceImage')
    }

    $diskInfo = Get-AVDPropertyValue -InputObject $properties -Names @('diskInfo', 'diskSettings')
    $managedDiskInfo = Get-AVDPropertyValue -InputObject $diskInfo -Names @('managedDisk')
    $ephemeralDiskSettings = Get-AVDPropertyValue -InputObject $diskInfo -Names @('diffDiskSettings', 'ephemeralOsDiskSettings', 'ephemeralDiskSettings', 'ephemeralDisk')
    $networkInfo = Get-AVDPropertyValue -InputObject $properties -Names @('networkInfo', 'networkSettings')
    $domainInfo = Get-AVDPropertyValue -InputObject $properties -Names @('domainInfo', 'domainJoinSettings')
    $activeDirectoryInfo = Get-AVDPropertyValue -InputObject $domainInfo -Names @('activeDirectoryInfo')
    $azureActiveDirectoryInfo = Get-AVDPropertyValue -InputObject $domainInfo -Names @('azureActiveDirectoryInfo')
    $securityInfo = Get-AVDPropertyValue -InputObject $properties -Names @('securityInfo', 'securitySettings')

    $vmAdminCredential = Get-AVDPropertyValue -InputObject $properties -Names @('vmAdminCredentials', 'vmAdminCredential')
    $adCredential = Get-AVDPropertyValue -InputObject $activeDirectoryInfo -Names @('domainCredentials', 'domainJoinCredential')
    if ($null -eq $adCredential) {
        $adCredential = Get-AVDPropertyValue -InputObject $properties -Names @('domainJoinCredentials', 'domainJoinCredential', 'adCredential')
    }

    $vmAdminUsernameReference = Get-AVDPropertyValue -InputObject $properties -Names @('vmAdminUsernameKeyVaultSecretUri')
    $vmAdminPasswordReference = Get-AVDPropertyValue -InputObject $properties -Names @('vmAdminPasswordKeyVaultSecretUri')
    if ($null -ne $vmAdminCredential) {
        if ($null -eq $vmAdminUsernameReference) {
            $vmAdminUsernameReference = Get-AVDPropertyValue -InputObject $vmAdminCredential -Names @('usernameKeyVaultSecretUri', 'usernameReference')
        }
        if ($null -eq $vmAdminPasswordReference) {
            $vmAdminPasswordReference = Get-AVDPropertyValue -InputObject $vmAdminCredential -Names @('passwordKeyVaultSecretUri', 'passwordReference')
        }
    }

    $adUsernameReference = Get-AVDPropertyValue -InputObject $properties -Names @('domainJoinUsernameKeyVaultSecretUri', 'adUsernameKeyVaultSecretUri')
    $adPasswordReference = Get-AVDPropertyValue -InputObject $properties -Names @('domainJoinPasswordKeyVaultSecretUri', 'adPasswordKeyVaultSecretUri')
    if ($null -ne $adCredential) {
        if ($null -eq $adUsernameReference) {
            $adUsernameReference = Get-AVDPropertyValue -InputObject $adCredential -Names @('usernameKeyVaultSecretUri', 'usernameReference')
        }
        if ($null -eq $adPasswordReference) {
            $adPasswordReference = Get-AVDPropertyValue -InputObject $adCredential -Names @('passwordKeyVaultSecretUri', 'passwordReference')
        }
    }

    $vmAdminCredentialData = [ordered]@{
        username = Convert-AVDKeyVaultReference -Reference $vmAdminUsernameReference
        password = Convert-AVDKeyVaultReference -Reference $vmAdminPasswordReference
    }

    $adCredentialData = [ordered]@{
        username = Convert-AVDKeyVaultReference -Reference $adUsernameReference
        password = Convert-AVDKeyVaultReference -Reference $adPasswordReference
    }

    $keyVaultReferences = @()
    if ($vmAdminCredentialData.username) {
        $keyVaultReferences += [ordered]@{
            purpose = 'vmAdminUsername'
            reference = $vmAdminCredentialData.username
        }
    }
    if ($vmAdminCredentialData.password) {
        $keyVaultReferences += [ordered]@{
            purpose = 'vmAdminPassword'
            reference = $vmAdminCredentialData.password
        }
    }
    if ($adCredentialData.username) {
        $keyVaultReferences += [ordered]@{
            purpose = 'domainJoinUsername'
            reference = $adCredentialData.username
        }
    }
    if ($adCredentialData.password) {
        $keyVaultReferences += [ordered]@{
            purpose = 'domainJoinPassword'
            reference = $adCredentialData.password
        }
    }

    $marketplaceImageData = [ordered]@{
        publisher = Get-AVDPropertyValue -InputObject $marketplaceInfo -Names @('publisher')
        offer = Get-AVDPropertyValue -InputObject $marketplaceInfo -Names @('offer')
        sku = Get-AVDPropertyValue -InputObject $marketplaceInfo -Names @('sku')
        version = Get-AVDPropertyValue -InputObject $marketplaceInfo -Names @('exactVersion', 'version')
    }
    $customInfo = Get-AVDPropertyValue -InputObject $imageInfo -Names @('customInfo', 'customImageInfo')
    $imageType = Get-AVDPropertyValue -InputObject $imageInfo -Names @('type', 'imageType')
    $customImageId = Get-AVDPropertyValue -InputObject $customInfo -Names @('resourceId', 'id')
    if ($null -eq $customImageId) {
        $customImageId = Get-AVDPropertyValue -InputObject $properties -Names @('customImageId', 'customImageResourceId', 'imageResourceId')
    }

    $profile = [ordered]@{
        status = 'configured'
        source = $Source
        name = Get-AVDPropertyValue -InputObject $Resource -Names @('name')
        id = Get-AVDPropertyValue -InputObject $Resource -Names @('id')
        type = Get-AVDPropertyValue -InputObject $Resource -Names @('type')
        version = Get-AVDPropertyValue -InputObject $properties -Names @('version')
        friendlyName = Get-AVDPropertyValue -InputObject $properties -Names @('friendlyName', 'description')
        provisioningState = Get-AVDPropertyValue -InputObject $properties -Names @('provisioningState')
        vmLocation = Get-AVDPropertyValue -InputObject $properties -Names @('vmLocation', 'location')
        vmResourceGroup = Get-AVDPropertyValue -InputObject $properties -Names @('vmResourceGroup', 'resourceGroup')
        vmNamePrefix = Get-AVDPropertyValue -InputObject $properties -Names @('vmNamePrefix', 'namePrefix')
        vmSize = Get-AVDPropertyValue -InputObject $properties -Names @('vmSizeId', 'vmSize', 'size')
        availabilityZones = Get-AVDPropertyValue -InputObject $properties -Names @('availabilityZones', 'zones')
        vmTags = Get-AVDPropertyValue -InputObject $properties -Names @('vmTags', 'tags')
        imageType = $imageType
        marketplaceImage = $marketplaceImageData
        customImageId = $customImageId
        image = [ordered]@{
            type = $imageType
            marketplace = $marketplaceImageData
            customImageId = $customImageId
        }
        disk = [ordered]@{
            managedDiskType = Get-AVDPropertyValue -InputObject $managedDiskInfo -Names @('type')
            osDiskSizeInGB = Get-AVDPropertyValue -InputObject $properties -Names @('osDiskSizeInGB', 'osDiskSizeGB')
            securityEncryptionType = Get-AVDPropertyValue -InputObject $properties -Names @('securityEncryptionType')
            ephemeral = [ordered]@{
                option = Get-AVDPropertyValue -InputObject $ephemeralDiskSettings -Names @('option')
                placement = Get-AVDPropertyValue -InputObject $ephemeralDiskSettings -Names @('placement')
            }
        }
        network = [ordered]@{
            subnetId = Get-AVDPropertyValue -InputObject $networkInfo -Names @('subnetId', 'virtualNetworkSubnetId')
            networkSecurityGroupId = Get-AVDPropertyValue -InputObject $networkInfo -Names @('securityGroupId', 'networkSecurityGroupId')
        }
        domainJoin = [ordered]@{
            type = Get-AVDPropertyValue -InputObject $domainInfo -Names @('joinType', 'domainJoinType')
            domainName = Get-AVDPropertyValue -InputObject $activeDirectoryInfo -Names @('domainName')
            organizationalUnitPath = Get-AVDPropertyValue -InputObject $activeDirectoryInfo -Names @('ouPath', 'organizationalUnitPath')
            mdmProviderGuid = Get-AVDPropertyValue -InputObject $azureActiveDirectoryInfo -Names @('mdmProviderGuid', 'intuneEnrollmentGuid')
        }
        security = [ordered]@{
            type = Get-AVDPropertyValue -InputObject $securityInfo -Names @('type', 'securityType')
            secureBoot = Get-AVDPropertyValue -InputObject $securityInfo -Names @('secureBootEnabled', 'secureBoot')
            vTpm = Get-AVDPropertyValue -InputObject $securityInfo -Names @('vTpmEnabled', 'vTpm', 'virtualTpm')
        }
        bootDiagnostics = Get-AVDPropertyValue -InputObject $properties -Names @('bootDiagnosticsInfo', 'bootDiagnostics', 'bootDiagnosticsSettings')
        customConfigurationScriptUrl = Get-AVDPropertyValue -InputObject $properties -Names @('customConfigurationScriptUrl', 'customConfigurationScriptUri')
        vmAdminCredential = $vmAdminCredentialData
        adCredential = $adCredentialData
        keyVaultReferences = $keyVaultReferences
    }

    return $profile
}

function Get-AVDSessionHostConfigurationData {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$SubscriptionId,
        [Parameter(Mandatory)]
        [string]$HostPoolName,
        [Parameter(Mandatory)]
        [string]$ResourceGroupName
    )

    $configurationCommand = Get-Command -Name 'Get-AzWvdSessionHostConfiguration' -ErrorAction SilentlyContinue
    $lastError = $null

    if ($configurationCommand) {
        try {
            $profiles = @(Get-AzWvdSessionHostConfiguration -HostPoolName $HostPoolName -ResourceGroupName $ResourceGroupName -ErrorAction Stop)
            $profile = $profiles | Where-Object { $_.Name -eq 'default' -or $_.Name -like '*/default' } | Select-Object -First 1
            if (-not $profile -and $profiles.Count -gt 0) {
                $profile = $profiles[0]
            }
            if ($profile) {
                return Convert-AVDSessionHostConfigurationData -Resource $profile -Source 'cmdlet'
            }
        }
        catch {
            $lastError = $_.Exception.Message
        }
    }

    if (-not (Get-Command -Name 'Invoke-AzRestMethod' -ErrorAction SilentlyContinue)) {
        return [ordered]@{
            status = 'unavailable'
            source = 'none'
            name = 'default'
            error = 'Neither Get-AzWvdSessionHostConfiguration nor Invoke-AzRestMethod is available.'
        }
    }

    $encodedSubscriptionId = [Uri]::EscapeDataString($SubscriptionId)
    $encodedResourceGroupName = [Uri]::EscapeDataString($ResourceGroupName)
    $encodedHostPoolName = [Uri]::EscapeDataString($HostPoolName)
    $apiVersions = @('2026-04-01-preview', '2025-04-01-preview', '2024-04-01-preview', '2023-11-01-preview')

    $allArmAttemptsNotFound = $true
    foreach ($apiVersion in $apiVersions) {
        $path = "/subscriptions/$encodedSubscriptionId/resourceGroups/$encodedResourceGroupName/providers/Microsoft.DesktopVirtualization/hostPools/$encodedHostPoolName/sessionHostConfigurations/default?api-version=$apiVersion"
        try {
            $response = Invoke-AzRestMethod -Path $path -Method GET -ErrorAction Stop
            if ($response.StatusCode -and [int]$response.StatusCode -ge 400) {
                if ([int]$response.StatusCode -eq 404) {
                    continue
                }
                $allArmAttemptsNotFound = $false
                continue
            }

            $allArmAttemptsNotFound = $false
            $document = if ($response.Content -is [string]) {
                ConvertFrom-Json -InputObject $response.Content -ErrorAction Stop
            } else {
                $response.Content
            }
            if ($document) {
                return Convert-AVDSessionHostConfigurationData -Resource $document -Source 'arm'
            }
        }
        catch {
            $lastError = $_.Exception.Message
            if ($lastError -notmatch '(?i)404|not.?found|resource.?not.?found') {
                $allArmAttemptsNotFound = $false
            }
        }
    }

    if ($allArmAttemptsNotFound) {
        return [ordered]@{
            status = 'notConfigured'
            source = if ($configurationCommand) { 'cmdlet-arm' } else { 'arm' }
            name = 'default'
            error = $null
        }
    }

    return [ordered]@{
        status = 'unavailable'
        source = if ($configurationCommand) { 'cmdlet-arm' } else { 'arm' }
        name = 'default'
        error = $lastError
    }
}

function Get-AVDScalingPlanResource {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$SubscriptionId,
        [Parameter(Mandatory)]
        [string]$ResourceGroupName,
        [Parameter(Mandatory)]
        [string]$ScalingPlanName
    )

    if (-not (Get-Command -Name 'Invoke-AzRestMethod' -ErrorAction SilentlyContinue)) {
        return $null
    }

    $encodedSubscriptionId = [Uri]::EscapeDataString($SubscriptionId)
    $encodedResourceGroupName = [Uri]::EscapeDataString($ResourceGroupName)
    $encodedScalingPlanName = [Uri]::EscapeDataString($ScalingPlanName)
    $apiVersions = @('2026-04-01-preview', '2025-10-10', '2024-04-03')

    foreach ($apiVersion in $apiVersions) {
        $path = "/subscriptions/$encodedSubscriptionId/resourceGroups/$encodedResourceGroupName/providers/Microsoft.DesktopVirtualization/scalingPlans/$encodedScalingPlanName?api-version=$apiVersion"
        try {
            $response = Invoke-AzRestMethod -Path $path -Method GET -ErrorAction Stop
            if ($response.StatusCode -and [int]$response.StatusCode -ge 400) {
                continue
            }

            $document = if ($response.Content -is [string]) {
                ConvertFrom-Json -InputObject $response.Content -ErrorAction Stop
            } else {
                $response.Content
            }

            if ($document) {
                return $document
            }
        }
        catch {
            continue
        }
    }

    return $null
}

function Get-AVDScalingScheduleTimeText {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$Schedule,
        [Parameter(Mandatory)]
        [string[]]$TimeNames,
        [Parameter(Mandatory)]
        [string[]]$HourNames,
        [Parameter(Mandatory)]
        [string[]]$MinuteNames
    )

    $time = Get-AVDPropertyValue -InputObject $Schedule -Names $TimeNames
    $hour = Get-AVDPropertyValue -InputObject $time -Names @('Hour', 'hour')
    $minute = Get-AVDPropertyValue -InputObject $time -Names @('Minute', 'minute')

    if ($null -eq $hour) {
        $hour = Get-AVDPropertyValue -InputObject $Schedule -Names $HourNames
    }
    if ($null -eq $minute) {
        $minute = Get-AVDPropertyValue -InputObject $Schedule -Names $MinuteNames
    }

    if ($null -eq $hour) {
        return 'N/A'
    }

    if ($null -eq $minute) {
        $minute = 0
    }

    return "{0:D2}:{1:D2}" -f ([int]$hour), ([int]$minute)
}

function Get-AVDInventoryData {
    [CmdletBinding()]
    param(
        [AllowEmptyCollection()]
        [string[]]$SubscriptionIds
    )
    
    Write-Host "    ○ Gathering subscriptions..." -ForegroundColor Gray
    
    $inventory = @{
        collectionTime = (Get-Date).ToString('o')
        subscriptions = @()
        summary = @{
            totalHostPools = 0
            totalSessionHosts = 0
            totalWorkspaces = 0
            totalApplicationGroups = 0
            totalScalingPlans = 0
            availableSessionHosts = 0
            unavailableSessionHosts = 0
            totalVNets = 0
            totalComputeGalleries = 0
            totalUserSessions = 0
            activeUserSessions = 0
            disconnectedUserSessions = 0
        }
        explanation = @{
            overview = "Azure Virtual Desktop (AVD) is a cloud-based desktop and application virtualization service. This inventory shows all AVD resources and their relationships."
            hostPools = "Host pools contain session hosts (VMs) that serve desktops and applications to users. They define the type (pooled/personal) and load balancing method."
            sessionHosts = "Session hosts are the VMs that run user sessions. They connect to virtual networks and can be managed by scaling plans."
            sessionHostConfigurations = "Session-host configuration profiles define the VM, image, disk, network, domain-join, security, diagnostics, and custom-script settings used when session hosts are created. Key Vault credentials are inventoried as secret URIs only; secret values are never retrieved."
            workspaces = "Workspaces are end-user facing resources that group application groups for a consistent user experience."
            applicationGroups = "Application groups define which applications or desktops users can access from a host pool."
            scalingPlans = "Scaling plans automate the start/stop of session hosts based on time schedules to optimize costs."
            virtualNetworks = "Virtual networks provide network connectivity for session hosts, enabling communication with other Azure services and on-premises resources."
            computeGalleries = "Compute galleries store and manage custom images used to deploy session hosts with pre-configured software."
            userSessions = "User sessions represent active and disconnected user connections to AVD session hosts. Active sessions are currently in use, while disconnected sessions are temporarily disconnected but still consuming resources."
        }
    }
    
    if ($PSBoundParameters.ContainsKey('SubscriptionIds')) {
        $subscriptions = @(Resolve-AVDSubscriptionSelection -SubscriptionIds $SubscriptionIds)
    } else {
        $subscriptions = @(Resolve-AVDSubscriptionSelection)
    }
    
    foreach ($sub in $subscriptions) {
        Write-Host "    ○ Processing subscription: $($sub.Name)" -ForegroundColor Gray

        $subData = @{
            id = $sub.Id
            name = $sub.Name
            tenantId = $sub.TenantId
            scanStatus = 'pending'
            scanError = $null
            hostPools = @()
            workspaces = @()
            applicationGroups = @()
            scalingPlans = @()
            virtualNetworks = @()
            computeGalleries = @()
        }

        try {
            Set-AzContext -SubscriptionId $sub.Id -ErrorAction Stop | Out-Null
            $null = @(Get-AzResourceGroup -ErrorAction Stop | Select-Object -First 1)
            $subData.scanStatus = 'scanning'
        }
        catch {
            $subData.scanStatus = 'skipped'
            $subData.scanError = 'No readable Azure resources were found or the current account lacks Reader access.'
            Write-Host "      ⚠ Skipping subscription: $($sub.Name)" -ForegroundColor Yellow
            $inventory.subscriptions += $subData
            continue
        }
        
        # Get Host Pools
        try {
            $hostPools = Get-AzWvdHostPool -ErrorAction SilentlyContinue
            foreach ($hp in $hostPools) {
                Write-Host "      • Host Pool: $($hp.Name)" -ForegroundColor DarkGray

                $sessionHostConfiguration = $null
                try {
                    $sessionHostConfiguration = Get-AVDSessionHostConfigurationData -SubscriptionId $sub.Id -HostPoolName $hp.Name -ResourceGroupName $hp.Id.Split('/')[4]
                }
                catch {
                    $sessionHostConfiguration = [ordered]@{
                        status = 'unavailable'
                        source = 'none'
                        name = 'default'
                        error = $_.Exception.Message
                    }
                    Write-Host "      ⚠ Could not retrieve session-host configuration: $($_.Exception.Message)" -ForegroundColor Yellow
                }
                
                $hpData = @{
                    name = $hp.Name
                    resourceGroup = $hp.Id.Split('/')[4]
                    location = $hp.Location
                    hostPoolType = $hp.HostPoolType
                    loadBalancerType = $hp.LoadBalancerType
                    maxSessionLimit = $hp.MaxSessionLimit
                    preferredAppGroupType = $hp.PreferredAppGroupType
                    registrationToken = if ($hp.RegistrationInfo.ExpirationTime) {
                        @{
                            exists = $true
                            expiration = $hp.RegistrationInfo.ExpirationTime.ToString('o')
                            expired = $hp.RegistrationInfo.ExpirationTime -lt (Get-Date)
                        }
                    } else {
                        @{ exists = $false }
                    }
                    sessionHosts = @()
                    sessionHostCount = 0
                    availableHosts = 0
                    unavailableHosts = 0
                    totalUserSessions = 0
                    activeUserSessions = 0
                    disconnectedUserSessions = 0
                    scalingPlanReference = $null
                    sessionHostConfiguration = $sessionHostConfiguration
                }
                
                # Get Session Hosts
                try {
                    $sessionHosts = Get-AzWvdSessionHost -HostPoolName $hp.Name -ResourceGroupName $hpData.resourceGroup -ErrorAction SilentlyContinue
                    $hpData.sessionHostCount = $sessionHosts.Count
                    
                    foreach ($sh in $sessionHosts) {
                        $shName = $sh.Name.Split('/')[1]
                        $sessions = Get-AzWvdUserSession -HostPoolName $hp.Name -ResourceGroupName $hpData.resourceGroup -SessionHostName $shName -ErrorAction SilentlyContinue
                        
                        # Count session states
                        $activeSessions = 0
                        $disconnectedSessions = 0
                        foreach ($session in $sessions) {
                            if ($session.SessionState -eq 'Active') {
                                $activeSessions++
                            } elseif ($session.SessionState -eq 'Disconnected') {
                                $disconnectedSessions++
                            }
                        }
                        
                        $hpData.totalUserSessions += $sessions.Count
                        $hpData.activeUserSessions += $activeSessions
                        $hpData.disconnectedUserSessions += $disconnectedSessions
                        
                        # Get VM network and image information
                        $vmName = $shName.Split('.')[0]
                        $networkInfo = $null
                        $imageInfo = $null
                        try {
                            # First try the host pool resource group
                            $vm = Get-AzVM -Name $vmName -ResourceGroupName $hpData.resourceGroup -ErrorAction SilentlyContinue
                            
                            # If not found, search all resource groups in the subscription
                            if (-not $vm) {
                                Write-Host "      Searching for VM $vmName in other resource groups..." -ForegroundColor Gray
                                $allVMs = Get-AzVM -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $vmName }
                                if ($allVMs -and $allVMs.Count -gt 0) {
                                    $vm = $allVMs[0]
                                    Write-Host "      Found VM in resource group: $($vm.ResourceGroupName)" -ForegroundColor Green
                                }
                            }
                            
                            if ($vm) {
                                # Network information
                                if ($vm.NetworkProfile.NetworkInterfaces -and $vm.NetworkProfile.NetworkInterfaces.Count -gt 0) {
                                    $nic = Get-AzNetworkInterface -ResourceId $vm.NetworkProfile.NetworkInterfaces[0].Id -ErrorAction SilentlyContinue
                                    if ($nic -and $nic.IpConfigurations -and $nic.IpConfigurations.Count -gt 0) {
                                        $vnetId = $nic.IpConfigurations[0].Subnet.Id
                                        $vnetName = $vnetId.Split('/')[8]
                                        $subnetName = $vnetId.Split('/')[10]
                                        $networkInfo = @{
                                            vnetName = $vnetName
                                            subnetName = $subnetName
                                            privateIP = $nic.IpConfigurations[0].PrivateIpAddress
                                            vnetResourceGroup = $vnetId.Split('/')[4]
                                            vnetId = $vnetId
                                        }
                                    }
                                }
                                
                                # Image information
                                if ($vm.StorageProfile.ImageReference.Id) {
                                    $imageId = $vm.StorageProfile.ImageReference.Id
                                    $imageInfo = @{
                                        type = 'Gallery'
                                        id = $imageId
                                        galleryName = $imageId.Split('/')[8]
                                        imageName = $imageId.Split('/')[10]
                                        version = $imageId.Split('/')[12]
                                    }
                                } elseif ($vm.StorageProfile.ImageReference.Offer) {
                                    $imageInfo = @{
                                        type = 'Marketplace'
                                        publisher = $vm.StorageProfile.ImageReference.Publisher
                                        offer = $vm.StorageProfile.ImageReference.Offer
                                        sku = $vm.StorageProfile.ImageReference.Sku
                                        version = $vm.StorageProfile.ImageReference.Version
                                    }
                                }
                            } else {
                                Write-Host "      ⚠ Could not find VM: $vmName" -ForegroundColor Yellow
                            }
                        }
                        catch {
                            Write-Host "      ⚠ Error retrieving VM info for $vmName : $($_.Exception.Message)" -ForegroundColor Yellow
                        }
                        
                        $shData = @{
                            name = $shName
                            status = $sh.Status
                            allowNewSession = $sh.AllowNewSession
                            sessions = $sessions.Count
                            activeSessions = $activeSessions
                            disconnectedSessions = $disconnectedSessions
                            assignedUser = $sh.AssignedUser
                            osVersion = $sh.OSVersion
                            agentVersion = $sh.AgentVersion
                            lastHeartBeat = if ($sh.LastHeartBeat) { $sh.LastHeartBeat.ToString('o') } else { $null }
                            updateState = $sh.UpdateState
                            vmSize = if ($vm) { $vm.HardwareProfile.VmSize } else { $null }
                            network = $networkInfo
                            image = $imageInfo
                        }
                        
                        if ($sh.Status -eq 'Available') {
                            $hpData.availableHosts++
                        } else {
                            $hpData.unavailableHosts++
                        }
                        
                        $hpData.sessionHosts += $shData
                    }
                }
                catch {
                    Write-Host "      ⚠ Could not retrieve session hosts: $($_.Exception.Message)" -ForegroundColor Yellow
                }
                
                $inventory.summary.totalSessionHosts += $hpData.sessionHostCount
                $inventory.summary.availableSessionHosts += $hpData.availableHosts
                $inventory.summary.unavailableSessionHosts += $hpData.unavailableHosts
                $inventory.summary.totalUserSessions += $hpData.totalUserSessions
                $inventory.summary.activeUserSessions += $hpData.activeUserSessions
                $inventory.summary.disconnectedUserSessions += $hpData.disconnectedUserSessions
                
                $subData.hostPools += $hpData
            }
            
            $inventory.summary.totalHostPools += $hostPools.Count
        }
        catch {
            Write-Host "    ⚠ Could not retrieve host pools: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Get Workspaces
        try {
            $workspaces = Get-AzWvdWorkspace -ErrorAction SilentlyContinue
            foreach ($ws in $workspaces) {
                $wsData = @{
                    name = $ws.Name
                    resourceGroup = $ws.Id.Split('/')[4]
                    location = $ws.Location
                    friendlyName = $ws.FriendlyName
                    description = $ws.Description
                    applicationGroupReferences = $ws.ApplicationGroupReference
                }
                $subData.workspaces += $wsData
            }
            $inventory.summary.totalWorkspaces += $workspaces.Count
        }
        catch {
            Write-Host "    ⚠ Could not retrieve workspaces: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Get Application Groups
        try {
            $appGroups = Get-AzWvdApplicationGroup -ErrorAction SilentlyContinue
            foreach ($ag in $appGroups) {
                $agData = @{
                    name = $ag.Name
                    resourceGroup = $ag.Id.Split('/')[4]
                    location = $ag.Location
                    friendlyName = $ag.FriendlyName
                    applicationGroupType = $ag.ApplicationGroupType
                    hostPoolArmPath = $ag.HostPoolArmPath
                    workspaceArmPath = $ag.WorkspaceArmPath
                    applications = @()
                }
                
                # Get Applications in the group
                if ($ag.ApplicationGroupType -eq 'RemoteApp') {
                    try {
                        $apps = Get-AzWvdApplication -GroupName $ag.Name -ResourceGroupName $agData.resourceGroup -ErrorAction SilentlyContinue
                        foreach ($app in $apps) {
                            $agData.applications += @{
                                name = $app.Name
                                friendlyName = $app.FriendlyName
                                filePath = $app.FilePath
                                commandLineSetting = $app.CommandLineSetting
                                showInPortal = $app.ShowInPortal
                            }
                        }
                    }
                    catch {
                        # Silently continue if apps cannot be retrieved
                    }
                }
                
                $subData.applicationGroups += $agData
            }
            $inventory.summary.totalApplicationGroups += $appGroups.Count
        }
        catch {
            Write-Host "    ⚠ Could not retrieve application groups: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Get Scaling Plans
        try {
            $scalingPlans = Get-AzWvdScalingPlan -ErrorAction SilentlyContinue
            foreach ($sp in $scalingPlans) {
                $spData = @{
                    name = $sp.Name
                    resourceGroup = $sp.Id.Split('/')[4]
                    location = $sp.Location
                    friendlyName = $sp.FriendlyName
                    description = $sp.Description
                    timeZone = $sp.TimeZone
                    hostPoolType = $sp.HostPoolType
                    exclusionTag = $sp.ExclusionTag
                    schedules = @()
                    hostPoolReferences = @()
                }

                $cmdletSchedules = @(Get-AVDPropertyValue -InputObject $sp -Names @('Schedule', 'schedule', 'Schedules', 'schedules'))
                $hasExtendedScheduleData = $false
                foreach ($cmdletSchedule in $cmdletSchedules) {
                    if ($null -ne (Get-AVDPropertyValue -InputObject $cmdletSchedule -Names @('CreateDelete', 'createDelete')) -or
                        $null -ne (Get-AVDPropertyValue -InputObject $cmdletSchedule -Names @('ScalingMethod', 'scalingMethod'))) {
                        $hasExtendedScheduleData = $true
                        break
                    }
                }

                $rawScalingPlan = if ($hasExtendedScheduleData) {
                    $null
                } else {
                    Get-AVDScalingPlanResource -SubscriptionId $sub.Id -ResourceGroupName $spData.resourceGroup -ScalingPlanName $sp.Name
                }
                $rawScalingPlanProperties = Get-AVDPropertyValue -InputObject $rawScalingPlan -Names @('properties', 'Properties')
                $rawSchedules = if ($null -ne $rawScalingPlanProperties) {
                    @(Get-AVDPropertyValue -InputObject $rawScalingPlanProperties -Names @('schedules', 'Schedules', 'schedule', 'Schedule'))
                } else {
                    @()
                }
                $scheduleCollection = if ($rawSchedules.Count -gt 0) { $rawSchedules } else { $cmdletSchedules }
                
                # Get schedules with proper time conversion
                if ($scheduleCollection.Count -gt 0) {
                    foreach ($schedule in $scheduleCollection) {
                        $createDelete = Get-AVDPropertyValue -InputObject $schedule -Names @('CreateDelete', 'createDelete')
                        $virtualMachineLimit = Get-AVDPropertyValue -InputObject $createDelete -Names @('VirtualMachineLimit', 'virtualMachineLimit', 'VmLimit', 'vmLimit', 'MaximumVirtualMachineLimit', 'maximumVirtualMachineLimit')
                        if ($null -eq $virtualMachineLimit) {
                            $virtualMachineLimit = Get-AVDPropertyValue -InputObject $schedule -Names @('VirtualMachineLimit', 'virtualMachineLimit', 'VmLimit', 'vmLimit', 'MaximumVirtualMachineLimit', 'maximumVirtualMachineLimit')
                        }

                        $createDeleteData = if ($createDelete) {
                            $minimumHostPoolSize = Get-AVDPropertyValue -InputObject $createDelete -Names @('MinimumHostPoolSize', 'minimumHostPoolSize', 'MinHostPoolSize', 'minHostPoolSize')
                            $maximumHostPoolSize = Get-AVDPropertyValue -InputObject $createDelete -Names @('MaximumHostPoolSize', 'maximumHostPoolSize', 'MaxHostPoolSize', 'maxHostPoolSize')
                            [ordered]@{
                                virtualMachineLimit = $virtualMachineLimit
                                rampUpMinimumHostPoolSize = if ($null -ne (Get-AVDPropertyValue -InputObject $createDelete -Names @('RampUpMinimumHostPoolSize', 'rampUpMinimumHostPoolSize'))) { Get-AVDPropertyValue -InputObject $createDelete -Names @('RampUpMinimumHostPoolSize', 'rampUpMinimumHostPoolSize') } else { $minimumHostPoolSize }
                                rampUpMaximumHostPoolSize = if ($null -ne (Get-AVDPropertyValue -InputObject $createDelete -Names @('RampUpMaximumHostPoolSize', 'rampUpMaximumHostPoolSize'))) { Get-AVDPropertyValue -InputObject $createDelete -Names @('RampUpMaximumHostPoolSize', 'rampUpMaximumHostPoolSize') } else { $maximumHostPoolSize }
                                rampDownMinimumHostPoolSize = if ($null -ne (Get-AVDPropertyValue -InputObject $createDelete -Names @('RampDownMinimumHostPoolSize', 'rampDownMinimumHostPoolSize'))) { Get-AVDPropertyValue -InputObject $createDelete -Names @('RampDownMinimumHostPoolSize', 'rampDownMinimumHostPoolSize') } else { $minimumHostPoolSize }
                                rampDownMaximumHostPoolSize = if ($null -ne (Get-AVDPropertyValue -InputObject $createDelete -Names @('RampDownMaximumHostPoolSize', 'rampDownMaximumHostPoolSize'))) { Get-AVDPropertyValue -InputObject $createDelete -Names @('RampDownMaximumHostPoolSize', 'rampDownMaximumHostPoolSize') } else { $maximumHostPoolSize }
                            }
                        } else {
                            $null
                        }

                        $daysOfWeek = Get-AVDPropertyValue -InputObject $schedule -Names @('DaysOfWeek', 'daysOfWeek')
                        $scalingMethod = Get-AVDPropertyValue -InputObject $schedule -Names @('ScalingMethod', 'scalingMethod')
                        $rampUpStartTime = Get-AVDScalingScheduleTimeText -Schedule $schedule -TimeNames @('RampUpStartTime', 'rampUpStartTime') -HourNames @('RampUpStartTimeHour', 'rampUpStartTimeHour') -MinuteNames @('RampUpStartTimeMinute', 'rampUpStartTimeMinute')
                        $peakStartTime = Get-AVDScalingScheduleTimeText -Schedule $schedule -TimeNames @('PeakStartTime', 'peakStartTime') -HourNames @('PeakStartTimeHour', 'peakStartTimeHour') -MinuteNames @('PeakStartTimeMinute', 'peakStartTimeMinute')
                        $rampDownStartTime = Get-AVDScalingScheduleTimeText -Schedule $schedule -TimeNames @('RampDownStartTime', 'rampDownStartTime') -HourNames @('RampDownStartTimeHour', 'rampDownStartTimeHour') -MinuteNames @('RampDownStartTimeMinute', 'rampDownStartTimeMinute')
                        $offPeakStartTime = Get-AVDScalingScheduleTimeText -Schedule $schedule -TimeNames @('OffPeakStartTime', 'offPeakStartTime') -HourNames @('OffPeakStartTimeHour', 'offPeakStartTimeHour') -MinuteNames @('OffPeakStartTimeMinute', 'offPeakStartTimeMinute')

                        $spData.schedules += @{
                            name = Get-AVDPropertyValue -InputObject $schedule -Names @('Name', 'name')
                            daysOfWeek = if (@($daysOfWeek).Count -gt 0) { @($daysOfWeek) -join ', ' } else { 'N/A' }
                            scalingMethod = $scalingMethod
                            virtualMachineLimit = $virtualMachineLimit
                            createDelete = $createDeleteData
                            rampUpStartTime = $rampUpStartTime
                            rampUpLoadBalancingAlgorithm = Get-AVDPropertyValue -InputObject $schedule -Names @('RampUpLoadBalancingAlgorithm', 'rampUpLoadBalancingAlgorithm')
                            rampUpMinimumHostsPct = Get-AVDPropertyValue -InputObject $schedule -Names @('RampUpMinimumHostsPct', 'rampUpMinimumHostsPct')
                            rampUpCapacityThresholdPct = Get-AVDPropertyValue -InputObject $schedule -Names @('RampUpCapacityThresholdPct', 'rampUpCapacityThresholdPct')
                            peakStartTime = $peakStartTime
                            peakLoadBalancingAlgorithm = Get-AVDPropertyValue -InputObject $schedule -Names @('PeakLoadBalancingAlgorithm', 'peakLoadBalancingAlgorithm')
                            rampDownStartTime = $rampDownStartTime
                            rampDownLoadBalancingAlgorithm = Get-AVDPropertyValue -InputObject $schedule -Names @('RampDownLoadBalancingAlgorithm', 'rampDownLoadBalancingAlgorithm')
                            rampDownMinimumHostsPct = Get-AVDPropertyValue -InputObject $schedule -Names @('RampDownMinimumHostsPct', 'rampDownMinimumHostsPct')
                            rampDownCapacityThresholdPct = Get-AVDPropertyValue -InputObject $schedule -Names @('RampDownCapacityThresholdPct', 'rampDownCapacityThresholdPct')
                            rampDownForceLogoffUser = Get-AVDPropertyValue -InputObject $schedule -Names @('RampDownForceLogoffUser', 'rampDownForceLogoffUser', 'RampDownForceLogoffUsers', 'rampDownForceLogoffUsers')
                            rampDownWaitTimeMinute = Get-AVDPropertyValue -InputObject $schedule -Names @('RampDownWaitTimeMinute', 'rampDownWaitTimeMinute', 'RampDownWaitTimeMinutes', 'rampDownWaitTimeMinutes')
                            rampDownNotificationMessage = Get-AVDPropertyValue -InputObject $schedule -Names @('RampDownNotificationMessage', 'rampDownNotificationMessage')
                            offPeakStartTime = $offPeakStartTime
                            offPeakLoadBalancingAlgorithm = Get-AVDPropertyValue -InputObject $schedule -Names @('OffPeakLoadBalancingAlgorithm', 'offPeakLoadBalancingAlgorithm')
                        }
                    }
                }
                
                # Get host pool references
                if ($sp.HostPoolReference) {
                    foreach ($hpRef in $sp.HostPoolReference) {
                        $spData.hostPoolReferences += @{
                            hostPoolArmPath = $hpRef.HostPoolArmPath
                            scalingPlanEnabled = $hpRef.ScalingPlanEnabled
                        }
                        
                        # Update host pool with scaling plan reference
                        foreach ($hp in $subData.hostPools) {
                            if ($hpRef.HostPoolArmPath -like "*/$($hp.name)") {
                                $hp.scalingPlanReference = $sp.Name
                            }
                        }
                    }
                }
                
                $subData.scalingPlans += $spData
            }
            $inventory.summary.totalScalingPlans += $scalingPlans.Count
        }
        catch {
            Write-Host "    ⚠ Could not retrieve scaling plans: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Get Virtual Networks used by AVD
        try {
            # Track unique VNets
            $avdVNetIds = @{}
            
            # Collect VNet IDs from session hosts
            foreach ($hp in $subData.hostPools) {
                foreach ($sh in $hp.sessionHosts) {
                    if ($sh.network -and $sh.network.vnetId) {
                        $avdVNetIds[$sh.network.vnetId] = @{
                            name = $sh.network.vnetName
                            resourceGroup = $sh.network.vnetResourceGroup
                        }
                    }
                }
            }
            
            # Get details for each unique VNet
            foreach ($vnetId in $avdVNetIds.Keys) {
                $vnetInfo = $avdVNetIds[$vnetId]
                try {
                    $vnet = Get-AzVirtualNetwork -Name $vnetInfo.name -ResourceGroupName $vnetInfo.resourceGroup -ErrorAction SilentlyContinue
                    
                    if ($vnet) {
                        # Count connected session hosts
                        $connectedHosts = 0
                        foreach ($hp in $subData.hostPools) {
                            foreach ($sh in $hp.sessionHosts) {
                                if ($sh.network -and $sh.network.vnetId -eq $vnetId) {
                                    $connectedHosts++
                                }
                            }
                        }
                        
                        $vnetData = @{
                            name = $vnet.Name
                            resourceGroup = $vnet.ResourceGroupName
                            location = $vnet.Location
                            addressSpace = $vnet.AddressSpace.AddressPrefixes -join ', '
                            subnets = @()
                            dnsServers = if ($vnet.DhcpOptions.DnsServers) { $vnet.DhcpOptions.DnsServers -join ', ' } else { 'Azure-provided' }
                            connectedSessionHosts = $connectedHosts
                            peerings = @()
                        }
                        
                        # Get subnet details
                        foreach ($subnet in $vnet.Subnets) {
                            $subnetHostCount = 0
                            foreach ($hp in $subData.hostPools) {
                                foreach ($sh in $hp.sessionHosts) {
                                    if ($sh.network -and $sh.network.vnetName -eq $vnet.Name -and $sh.network.subnetName -eq $subnet.Name) {
                                        $subnetHostCount++
                                    }
                                }
                            }
                            
                            $vnetData.subnets += @{
                                name = $subnet.Name
                                addressPrefix = $subnet.AddressPrefix
                                connectedSessionHosts = $subnetHostCount
                            }
                        }
                        
                        # Get VNet peerings
                        if ($vnet.VirtualNetworkPeerings) {
                            foreach ($peering in $vnet.VirtualNetworkPeerings) {
                                $vnetData.peerings += @{
                                    name = $peering.Name
                                    remoteVirtualNetwork = $peering.RemoteVirtualNetwork.Id.Split('/')[8]
                                    peeringState = $peering.PeeringState
                                    allowForwardedTraffic = $peering.AllowForwardedTraffic
                                    allowGatewayTransit = $peering.AllowGatewayTransit
                                }
                            }
                        }
                        
                        $subData.virtualNetworks += $vnetData
                    }
                }
                catch {
                    Write-Host "      ⚠ Could not retrieve VNet details: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
            $inventory.summary.totalVNets += $subData.virtualNetworks.Count
        }
        catch {
            Write-Host "    ⚠ Could not retrieve virtual networks: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Get Compute Galleries
        try {
            $galleries = Get-AzGallery -ErrorAction SilentlyContinue
            foreach ($gallery in $galleries) {
                Write-Host "      • Compute Gallery: $($gallery.Name)" -ForegroundColor DarkGray
                
                $galleryData = @{
                    name = $gallery.Name
                    resourceGroup = $gallery.ResourceGroupName
                    location = $gallery.Location
                    provisioningState = $gallery.ProvisioningState
                    description = $gallery.Description
                    images = @()
                }
                
                # Get images in the gallery
                try {
                    $images = Get-AzGalleryImageDefinition -ResourceGroupName $gallery.ResourceGroupName -GalleryName $gallery.Name -ErrorAction SilentlyContinue
                    foreach ($image in $images) {
                        $imageData = @{
                            name = $image.Name
                            osType = $image.OsType
                            osState = $image.OsState
                            hyperVGeneration = $image.HyperVGeneration
                            description = $image.Description
                            publisher = $image.Identifier.Publisher
                            offer = $image.Identifier.Offer
                            sku = $image.Identifier.Sku
                            versions = @()
                            usedBySessionHosts = 0
                        }
                        
                        # Get image versions
                        try {
                            $versions = Get-AzGalleryImageVersion -ResourceGroupName $gallery.ResourceGroupName -GalleryName $gallery.Name -GalleryImageDefinitionName $image.Name -ErrorAction SilentlyContinue
                            foreach ($version in $versions) {
                                $versionData = @{
                                    name = $version.Name
                                    location = $version.Location
                                    provisioningState = $version.ProvisioningState
                                    publishingDate = if ($version.PublishingProfile.PublishedDate) { $version.PublishingProfile.PublishedDate.ToString('o') } else { 'N/A' }
                                    replicaCount = $version.PublishingProfile.ReplicaCount
                                    usedBy = @()
                                }
                                
                                # Find session hosts using this version
                                foreach ($hp in $subData.hostPools) {
                                    foreach ($sh in $hp.sessionHosts) {
                                        if ($sh.image -and $sh.image.type -eq 'Gallery' -and 
                                            $sh.image.imageName -eq $image.Name -and 
                                            $sh.image.version -eq $version.Name) {
                                            $versionData.usedBy += $sh.name
                                        }
                                    }
                                }
                                
                                $imageData.versions += $versionData
                            }
                        }
                        catch {
                            # Silently continue if versions cannot be retrieved
                        }
                        
                        # Count how many session hosts use this image
                        foreach ($hp in $subData.hostPools) {
                            foreach ($sh in $hp.sessionHosts) {
                                if ($sh.image -and $sh.image.type -eq 'Gallery' -and $sh.image.imageName -eq $image.Name) {
                                    $imageData.usedBySessionHosts++
                                }
                            }
                        }
                        
                        $galleryData.images += $imageData
                    }
                }
                catch {
                    Write-Host "      ⚠ Could not retrieve gallery images: $($_.Exception.Message)" -ForegroundColor Yellow
                }
                
                $subData.computeGalleries += $galleryData
            }
            $inventory.summary.totalComputeGalleries += $galleries.Count
        }
        catch {
            Write-Host "    ⚠ Could not retrieve compute galleries: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        $subData.scanStatus = 'scanned'
        $inventory.subscriptions += $subData
    }
    
    Write-Host "    ✓ Inventory collection complete" -ForegroundColor Green
    return $inventory
}

function Get-AVDConnectionDiagram {
    [CmdletBinding()]
    param(
        [AllowEmptyCollection()]
        [string[]]$SubscriptionIds
    )
    
    Write-Host "    ○ Generating connection diagram..." -ForegroundColor Gray
    
    $diagram = @{
        nodes = @()
        edges = @()
    }
    
    if ($PSBoundParameters.ContainsKey('SubscriptionIds')) {
        $subscriptions = @(Resolve-AVDSubscriptionSelection -SubscriptionIds $SubscriptionIds)
    } else {
        $subscriptions = @(Resolve-AVDSubscriptionSelection)
    }
    
    foreach ($sub in $subscriptions) {
        try {
            Set-AzContext -SubscriptionId $sub.Id -ErrorAction Stop | Out-Null
        }
        catch {
            Write-Host "      ⚠ Skipping diagram subscription: $($sub.Name)" -ForegroundColor Yellow
            continue
        }
        
        # Add subscription node
        $diagram.nodes += @{
            id = "sub-$($sub.Id)"
            label = $sub.Name
            type = "subscription"
            group = 1
        }
        
        # Get Host Pools
        $hostPools = Get-AzWvdHostPool -ErrorAction SilentlyContinue
        foreach ($hp in $hostPools) {
            $hpId = "hp-$($hp.Id)"
            $diagram.nodes += @{
                id = $hpId
                label = $hp.Name
                type = "hostpool"
                group = 2
                details = @{
                    type = $hp.HostPoolType
                    loadBalancer = $hp.LoadBalancerType
                }
            }
            
            $diagram.edges += @{
                from = "sub-$($sub.Id)"
                to = $hpId
                label = "contains"
            }
            
            # Get Session Hosts
            $rgName = $hp.Id.Split('/')[4]
            $sessionHosts = Get-AzWvdSessionHost -HostPoolName $hp.Name -ResourceGroupName $rgName -ErrorAction SilentlyContinue
            
            foreach ($sh in $sessionHosts) {
                $shId = "sh-$($sh.Id)"
                $shName = $sh.Name.Split('/')[1]
                $diagram.nodes += @{
                    id = $shId
                    label = $shName
                    type = "sessionhost"
                    group = 3
                    details = @{
                        status = $sh.Status
                        sessions = 0
                    }
                }
                
                $diagram.edges += @{
                    from = $hpId
                    to = $shId
                    label = "manages"
                }
                
                # Get VM network information for VNet connection
                try {
                    $vmName = $shName.Split('.')[0]
                    $vm = Get-AzVM -Name $vmName -ResourceGroupName $rgName -ErrorAction SilentlyContinue
                    if ($vm) {
                        $nic = Get-AzNetworkInterface -ResourceId $vm.NetworkProfile.NetworkInterfaces[0].Id -ErrorAction SilentlyContinue
                        if ($nic) {
                            $vnetId = $nic.IpConfigurations[0].Subnet.Id
                            $vnetName = $vnetId.Split('/')[8]
                            
                            # Add edge to VNet
                            $vnetNodeId = "vnet-$vnetId"
                            $diagram.edges += @{
                                from = $shId
                                to = $vnetNodeId
                                label = "connected to"
                            }
                        }
                    }
                }
                catch {
                    # Silently continue if network info cannot be retrieved
                }
            }
        }
        
        # Get Workspaces
        $workspaces = Get-AzWvdWorkspace -ErrorAction SilentlyContinue
        foreach ($ws in $workspaces) {
            $wsId = "ws-$($ws.Id)"
            $diagram.nodes += @{
                id = $wsId
                label = $ws.Name
                type = "workspace"
                group = 4
            }
            
            $diagram.edges += @{
                from = "sub-$($sub.Id)"
                to = $wsId
                label = "contains"
            }
        }
        
        # Get Application Groups
        $appGroups = Get-AzWvdApplicationGroup -ErrorAction SilentlyContinue
        foreach ($ag in $appGroups) {
            $agId = "ag-$($ag.Id)"
            $diagram.nodes += @{
                id = $agId
                label = $ag.Name
                type = "applicationgroup"
                group = 5
                details = @{
                    type = $ag.ApplicationGroupType
                }
            }
            
            # Link to host pool
            if ($ag.HostPoolArmPath) {
                $hpConnectId = "hp-$($ag.HostPoolArmPath)"
                $diagram.edges += @{
                    from = $agId
                    to = $hpConnectId
                    label = "uses"
                }
            }
            
            # Link to workspace
            if ($ag.WorkspaceArmPath) {
                $wsConnectId = "ws-$($ag.WorkspaceArmPath)"
                $diagram.edges += @{
                    from = $wsConnectId
                    to = $agId
                    label = "publishes"
                }
            }
        }
        
        # Get Scaling Plans
        $scalingPlans = Get-AzWvdScalingPlan -ErrorAction SilentlyContinue
        foreach ($sp in $scalingPlans) {
            $spId = "sp-$($sp.Id)"
            $diagram.nodes += @{
                id = $spId
                label = $sp.Name
                type = "scalingplan"
                group = 6
                details = @{
                    hostPoolType = $sp.HostPoolType
                    timeZone = $sp.TimeZone
                }
            }
            
            $diagram.edges += @{
                from = "sub-$($sub.Id)"
                to = $spId
                label = "contains"
            }
            
            # Link to host pools
            if ($sp.HostPoolReference) {
                foreach ($hpRef in $sp.HostPoolReference) {
                    $hpConnectId = "hp-$($hpRef.HostPoolArmPath)"
                    $diagram.edges += @{
                        from = $spId
                        to = $hpConnectId
                        label = "scales"
                    }
                }
            }
        }
        
        # Get Virtual Networks (only those used by AVD)
        $vnets = Get-AzVirtualNetwork -ErrorAction SilentlyContinue
        $addedVNets = @{}
        foreach ($vnet in $vnets) {
            $vnetId = $vnet.Id
            
            # Check if this VNet is already referenced in edges
            $isUsed = $diagram.edges | Where-Object { $_.to -eq "vnet-$vnetId" }
            
            if ($isUsed -and -not $addedVNets.ContainsKey($vnetId)) {
                $diagram.nodes += @{
                    id = "vnet-$vnetId"
                    label = $vnet.Name
                    type = "vnet"
                    group = 7
                    details = @{
                        addressSpace = $vnet.AddressSpace.AddressPrefixes -join ', '
                        location = $vnet.Location
                    }
                }
                
                $diagram.edges += @{
                    from = "sub-$($sub.Id)"
                    to = "vnet-$vnetId"
                    label = "contains"
                }
                
                $addedVNets[$vnetId] = $true
            }
        }
    }
    
    Write-Host "    ✓ Diagram generation complete" -ForegroundColor Green
    return $diagram
}

function Edit-WAFConfig {
    <#
    .SYNOPSIS
        Interactive wizard to edit the WAF assessment configuration file.
    .DESCRIPTION
        Provides a menu-driven console wizard for viewing and editing the
        waf-config.json used by the AVD Inventory Dashboard. You can update
        pillar descriptions, add/remove/edit rules, adjust scoring thresholds,
        and modify status mapping colours — all without touching JSON directly.
    .PARAMETER ConfigPath
        Full path to the waf-config.json file.
        Defaults to waf-config.json in the same directory as this script.
    .EXAMPLE
        Edit-WAFConfig
    .EXAMPLE
        Edit-WAFConfig -ConfigPath 'C:\MyConfig\waf-config.json'
    #>
    [CmdletBinding()]
    param(
        [string]$ConfigPath = (Join-Path $PSScriptRoot 'waf-config.json')
    )

    # ── helpers ──────────────────────────────────────────────────────────────

    function Write-Header {
        param([string]$Title)
        $width = 60
        $line  = '─' * $width
        Write-Host ""
        Write-Host $line -ForegroundColor DarkCyan
        Write-Host ("  {0}" -f $Title) -ForegroundColor Cyan
        Write-Host $line -ForegroundColor DarkCyan
    }

    function Read-Input {
        param([string]$Prompt, [string]$Default = '')
        if ($Default -ne '') {
            $display = "$Prompt [$Default]: "
        } else {
            $display = "${Prompt}: "
        }
        Write-Host $display -ForegroundColor Yellow -NoNewline
        $input = Read-Host
        if ($input -eq '') { return $Default }
        return $input
    }

    function Read-MenuChoice {
        param([string[]]$Options, [string]$Prompt = 'Choose')
        for ($i = 0; $i -lt $Options.Count; $i++) {
            Write-Host ("  [{0}] {1}" -f ($i + 1), $Options[$i]) -ForegroundColor White
        }
        do {
            Write-Host ""
            Write-Host "$Prompt (1-$($Options.Count)): " -ForegroundColor Yellow -NoNewline
            $raw = Read-Host
            $n   = 0
            $valid = [int]::TryParse($raw, [ref]$n) -and $n -ge 1 -and $n -le $Options.Count
            if (-not $valid) {
                Write-Host "  Invalid choice — enter a number between 1 and $($Options.Count)." -ForegroundColor Red
            }
        } until ($valid)
        return $n
    }

    function Save-Config {
        param($Config)
        $json = $Config | ConvertTo-Json -Depth 20
        Set-Content -Path $ConfigPath -Value $json -Encoding UTF8
        Write-Host ""
        Write-Host "  ✓ Configuration saved to: $ConfigPath" -ForegroundColor Green
    }

    # ── load config ──────────────────────────────────────────────────────────

    if (-not (Test-Path $ConfigPath)) {
        Write-Host "  ✗ Configuration file not found: $ConfigPath" -ForegroundColor Red
        return
    }

    try {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    } catch {
        Write-Host "  ✗ Failed to load configuration: $($_.Exception.Message)" -ForegroundColor Red
        return
    }

    $pillarKeys = @('reliability', 'security', 'costOptimization', 'operationalExcellence', 'performance')

    # ── main menu loop ────────────────────────────────────────────────────────

    $exit = $false
    while (-not $exit) {
        Write-Header "WAF Configuration Wizard  (v$($config.version))"
        Write-Host "  Config: $ConfigPath" -ForegroundColor Gray
        Write-Host ""

        $mainOptions = @(
            'View pillar summary'
            'Edit a pillar (name / description / maxChecks)'
            'Edit rules inside a pillar'
            'Edit status mapping (score thresholds & colours)'
            'Edit config version / description'
            'Save and exit'
            'Exit without saving'
        )
        $choice = Read-MenuChoice -Options $mainOptions -Prompt 'Main menu'

        switch ($choice) {

            # ── 1. view summary ──────────────────────────────────────────────
            1 {
                Write-Header 'Pillar Summary'
                foreach ($key in $pillarKeys) {
                    $p = $config.pillars.$key
                    if ($null -eq $p) { continue }
                    $ruleCount = if ($p.rules) { $p.rules.Count } else { 0 }
                    Write-Host ("  {0,-28} maxChecks={1,3}  rules={2,2}  {3}" -f `
                        $p.name, $p.maxChecks, $ruleCount, $p.description) -ForegroundColor White
                }
                Write-Host ""
                Write-Host '  Press Enter to continue...' -ForegroundColor Gray
                Read-Host | Out-Null
            }

            # ── 2. edit pillar metadata ──────────────────────────────────────
            2 {
                Write-Header 'Edit Pillar Metadata'
                $pChoice = Read-MenuChoice -Options ($pillarKeys | ForEach-Object { $config.pillars.$_.name }) `
                    -Prompt 'Select pillar'
                $pKey    = $pillarKeys[$pChoice - 1]
                $pillar  = $config.pillars.$pKey

                Write-Host ""
                $pillar.name        = Read-Input 'Pillar name'        $pillar.name
                $pillar.description = Read-Input 'Description'        $pillar.description
                $maxRaw             = Read-Input 'Max checks (points)' $pillar.maxChecks.ToString()
                $maxN               = 0
                if ([int]::TryParse($maxRaw, [ref]$maxN) -and $maxN -gt 0) {
                    $pillar.maxChecks = $maxN
                } else {
                    Write-Host '  Invalid number — maxChecks unchanged.' -ForegroundColor Yellow
                }
                Write-Host "  ✓ Pillar '$($pillar.name)' metadata updated." -ForegroundColor Green
            }

            # ── 3. edit rules ────────────────────────────────────────────────
            3 {
                Write-Header 'Edit Rules'
                $pChoice = Read-MenuChoice -Options ($pillarKeys | ForEach-Object { $config.pillars.$_.name }) `
                    -Prompt 'Select pillar'
                $pKey   = $pillarKeys[$pChoice - 1]
                $pillar = $config.pillars.$pKey

                $ruleExit = $false
                while (-not $ruleExit) {
                    Write-Header ("Rules in: $($pillar.name)")
                    $ruleNames = @($pillar.rules | ForEach-Object { "$($_.id) — $($_.name)  [$($_.points) pt(s)]" })
                    $ruleOptions = $ruleNames + @('Add new rule', 'Back')
                    $rChoice = Read-MenuChoice -Options $ruleOptions -Prompt 'Select rule'

                    if ($rChoice -eq $ruleOptions.Count) {
                        # Back
                        $ruleExit = $true
                    } elseif ($rChoice -eq ($ruleOptions.Count - 1)) {
                        # Add new rule
                        Write-Header 'Add New Rule'
                        $newRule = [ordered]@{
                            id          = Read-Input 'Rule ID (e.g. rel-10)'
                            name        = Read-Input 'Rule name'
                            description = Read-Input 'Description'
                            points      = 0
                        }
                        $ptsRaw = Read-Input 'Points'
                        $ptsN   = 0
                        if ([int]::TryParse($ptsRaw, [ref]$ptsN) -and $ptsN -ge 0) {
                            $newRule.points = $ptsN
                        }
                        $newRule.successMessage = Read-Input 'Success message'
                        $newRule.failureMessage = Read-Input 'Failure message'
                        $newRule.recommendation = Read-Input 'Recommendation (optional)'

                        $pillar.rules += [PSCustomObject]$newRule
                        Write-Host "  ✓ Rule '$($newRule.id)' added." -ForegroundColor Green

                    } else {
                        # Edit existing rule
                        $rule = $pillar.rules[$rChoice - 1]
                        Write-Header "Edit Rule: $($rule.id)"

                        $rule.name        = Read-Input 'Name'        $rule.name
                        $rule.description = Read-Input 'Description' $rule.description

                        $ptsRaw = Read-Input 'Points' $rule.points.ToString()
                        $ptsN   = 0
                        if ([int]::TryParse($ptsRaw, [ref]$ptsN) -and $ptsN -ge 0) {
                            $rule.points = $ptsN
                        }

                        if ($rule.PSObject.Properties['successMessage']) {
                            $rule.successMessage = Read-Input 'Success message' $rule.successMessage
                        }
                        if ($rule.PSObject.Properties['warningMessage']) {
                            $rule.warningMessage = Read-Input 'Warning message' $rule.warningMessage
                        }
                        if ($rule.PSObject.Properties['failureMessage']) {
                            $rule.failureMessage = Read-Input 'Failure message' $rule.failureMessage
                        }
                        if ($rule.PSObject.Properties['recommendation']) {
                            $rule.recommendation = Read-Input 'Recommendation' $rule.recommendation
                        }

                        Write-Host ""
                        Write-Host "  Delete this rule? " -ForegroundColor Yellow -NoNewline
                        $del = Read-Host '[y/N]'
                        if ($del -match '^[Yy]$') {
                            $pillar.rules = @($pillar.rules | Where-Object { $_.id -ne $rule.id })
                            Write-Host "  ✓ Rule '$($rule.id)' deleted." -ForegroundColor Green
                        } else {
                            Write-Host "  ✓ Rule '$($rule.id)' updated." -ForegroundColor Green
                        }
                    }
                }
            }

            # ── 4. status mapping ────────────────────────────────────────────
            4 {
                Write-Header 'Edit Status Mapping'
                $statusKeys = @('excellent', 'good', 'fair', 'needsImprovement')
                foreach ($sk in $statusKeys) {
                    $s = $config.statusMapping.$sk
                    Write-Host ""
                    Write-Host "  ── $sk ──" -ForegroundColor Cyan
                    $threshRaw = Read-Input "  Threshold (score %)" $s.threshold.ToString()
                    $threshN   = 0
                    if ([int]::TryParse($threshRaw, [ref]$threshN) -and $threshN -ge 0) {
                        $s.threshold = $threshN
                    }
                    $colRaw = Read-Input "  Hex colour" $s.color
                    if ($colRaw -match '^#[0-9A-Fa-f]{6}$') {
                        $s.color = $colRaw
                    } elseif ($colRaw -ne $s.color) {
                        Write-Host '  Invalid hex colour — value unchanged.' -ForegroundColor Yellow
                    }
                }
                Write-Host "  ✓ Status mapping updated." -ForegroundColor Green
            }

            # ── 5. version / description ─────────────────────────────────────
            5 {
                Write-Header 'Edit Config Version / Description'
                $config.version     = Read-Input 'Version'     $config.version
                $config.description = Read-Input 'Description' $config.description
                Write-Host "  ✓ Metadata updated." -ForegroundColor Green
            }

            # ── 6. save and exit ─────────────────────────────────────────────
            6 {
                Save-Config $config
                $exit = $true
            }

            # ── 7. exit without saving ───────────────────────────────────────
            7 {
                Write-Host ""
                Write-Host "  Changes discarded. Configuration file was NOT modified." -ForegroundColor Yellow
                $exit = $true
            }
        }
    }
}
