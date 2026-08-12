@{
    # Module metadata
    RootModule        = 'documenter-azure-azurevirtualdesktop.psm1'
    ModuleVersion     = '1.2.231'
    GUID              = 'b5e91f3c-2a7d-4e08-bc4f-1d6a83f0e2c9'
    Author            = 'Alex ter Neuzen'
    CompanyName       = 'GetToTheCloud'
    Copyright         = '(c) 2025 Alex ter Neuzen. All rights reserved.'
    Description       = 'Comprehensive inventory and documentation tool for Azure Virtual Desktop (AVD) environments. Collects host pools, session hosts, session-host configuration profiles, workspaces, application groups, dynamic scaling plans, virtual networks, and compute gallery inventory, then presents it in a local web-based dashboard with WAF assessment and professional PDF export.'
    PowerShellVersion = '7.0'

    # Required modules (installed from PSGallery on demand by the module)
    RequiredModules = @(
        @{ ModuleName = 'Az.Accounts';                ModuleVersion = '2.0.0' }
        @{ ModuleName = 'Az.DesktopVirtualization';   ModuleVersion = '4.0.0' }
        @{ ModuleName = 'Az.Compute';                 ModuleVersion = '5.0.0' }
        @{ ModuleName = 'Az.Network';                 ModuleVersion = '5.0.0' }
        @{ ModuleName = 'Az.Resources';               ModuleVersion = '6.0.0' }
    )

    # Exports
    FunctionsToExport = @('Get-AVDInventoryData', 'Start-AVDInventoryServer', 'Edit-WAFConfig')
    CmdletsToExport   = @()
    VariablesToExport = @()
    AliasesToExport   = @()

    # All files that are part of the module package
    FileList = @(
        'documenter-azure-azurevirtualdesktop.psd1'
        'documenter-azure-azurevirtualdesktop.psm1'
        'Get-AVDInventory.ps1'
        'Start-AVDInventoryServer.ps1'
        'index.html'
        'app.js'
        'styles.css'
        'gettothecloud-logo.webp'
        'waf-config.json'
        'LICENSE'
        'README.md'
        'CHANGES.md'
        'WAF-CONFIG-GUIDE.md'
        'start.sh'
    )

    PrivateData = @{
        PSData = @{
            Tags = @(
                'Azure'
                'AVD'
                'AzureVirtualDesktop'
                'VirtualDesktop'
                'WVD'
                'WindowsVirtualDesktop'
                'Inventory'
                'Dashboard'
                'Documentation'
                'WAF'
                'WellArchitectedFramework'
                'Documenter'
                'HostPool'
                'SessionHost'
            )
            LicenseUri   = 'https://github.com/GetToThe-Cloud/documenter-azure-azurevirtualdesktop/blob/main/LICENSE'
            ProjectUri   = 'https://github.com/GetToThe-Cloud/documenter-azure-azurevirtualdesktop'
            IconUri      = ''
            ReleaseNotes = @'
            v1.2.231
              - Fixed dynamic scaling exports when VM limits and host-pool minimum/maximum sizes are nested in create/delete schedule settings
              - Added an ARM scaling-plan fallback for Az models that omit extended schedule fields and normalized REST and legacy schedule times
              - Added session-host configuration profile details to the PDF, including URI-only Key Vault references
              - Added the GetToTheCloud wordmark and branded navy/azure report styling with responsive headers and footers
              - Served the packaged WebP wordmark as binary data from the PowerShell HttpListener for reliable PDF branding

            v1.2.230
              - Consolidated security hardening, including XSS escaping, strict WAF condition parsing, and CDN SRI attributes
              - Added subscription scope selection, validation, permission visibility, and interactive browser login
              - Added reliable asynchronous Ctrl+C shutdown for the PowerShell HttpListener and direct foreground execution from start.sh
              - Added session-host configuration profile inventory with ARM fallback and VM, image, disk, network, domain-join, security, diagnostics, and custom-script details
              - Records Key Vault credential references as URI metadata only; secret values are never retrieved
              - Added dynamic scaling schedule inventory for scaling methods, VM limits, host-pool minimum and maximum sizes, minimum-host percentages, and capacity thresholds
              - Displays the new scaling and session-host configuration details in the dashboard and PDF export
              - Prompts before updating newer Az modules; -UpdateModules remains available for non-interactive automatic updates

v1.2.223
  - Version bump to 1.2.223
  - Edit-WAFConfig interactive console wizard (pillar metadata, rule add/edit/delete,
    status mapping thresholds & colours, version/description fields)
  - PSGallery module packaging: psd1 manifest, psm1 root module, FunctionsToExport
  - README updated with PSGallery install instructions and Edit-WAFConfig documentation

v1.2.0
  - Server-side WAF configuration loading via /api/waf/config endpoint
  - Configuration loaded once on server startup for efficiency
  - PSGallery module packaging: psd1 manifest, psm1 root module, FunctionsToExport

v1.1.0
  - Performance improvement: embedded WAF configuration in app.js
  - Eliminated external file fetch on page load

v1.0.0
  - Initial release
  - Configuration-driven WAF assessment system
  - JSON export functionality for inventory resources
  - Comprehensive AVD inventory: host pools, session hosts, workspaces, application groups,
    scaling plans, virtual networks, compute galleries
  - Dark-themed web dashboard with real-time status indicators
  - Professional PDF export with WAF assessment scoring
'@
        }
    }
}
