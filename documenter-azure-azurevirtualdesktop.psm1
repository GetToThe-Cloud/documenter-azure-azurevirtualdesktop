#Requires -Version 7.0

<#
.SYNOPSIS
    Azure Virtual Desktop Inventory Dashboard module.
.DESCRIPTION
    Loads the private script components and exports the two public commands:
      - Get-AVDInventoryData     : Collect inventory data from Azure Virtual Desktop environments.
      - Start-AVDInventoryServer : Launch the local web dashboard for the collected data.
#>

# Dot-source private script components so their functions are available in this module scope.
. (Join-Path $PSScriptRoot 'Get-AVDInventory.ps1')

function Start-AVDInventoryServer {
    <#
    .SYNOPSIS
        Starts the Azure Virtual Desktop Inventory web dashboard.
    .DESCRIPTION
        Launches a local web server that provides a live view of Azure Virtual Desktop inventory
        with authentication, navigation, PDF export, and connection diagrams.
    .PARAMETER Port
        Port number for the web server (default: 8080).
    .PARAMETER UpdateModules
        Update Azure modules to the latest version if newer versions are available.
    .EXAMPLE
        Start-AVDInventoryServer
    .EXAMPLE
        Start-AVDInventoryServer -Port 9090 -UpdateModules
    #>
    [CmdletBinding()]
    param(
        [int]$Port = 8080,
        [switch]$UpdateModules
    )

    & (Join-Path $PSScriptRoot 'Start-AVDInventoryServer.ps1') -Port $Port -UpdateModules:$UpdateModules
}

Export-ModuleMember -Function 'Get-AVDInventoryData', 'Start-AVDInventoryServer', 'Edit-WAFConfig'
