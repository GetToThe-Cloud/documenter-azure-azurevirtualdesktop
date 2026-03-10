#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Azure Virtual Desktop Inventory Web Server
.DESCRIPTION
    Starts a web server that provides a live view of Azure Virtual Desktop inventory
    with authentication, navigation, PDF export, and connection diagrams.
.PARAMETER Port
    Port number for the web server (default: 8080)
.PARAMETER UpdateModules
    Update Azure modules to the latest version if newer versions are available
.AUTHOR
    Alex ter Neuzen - https://www.gettothe.cloud
.LINK
    https://www.gettothe.cloud
#>

param(
    [int]$Port = 8080,
    [switch]$UpdateModules
)

# Import required modules
$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Azure Virtual Desktop Inventory Server..." -ForegroundColor Cyan

# Import inventory collection module first (to get Test-Prerequisites function)
$inventoryModulePath = Join-Path $PSScriptRoot "Get-AVDInventory.ps1"
Write-Host "📦 Loading inventory module from: $inventoryModulePath" -ForegroundColor Gray
if (Test-Path $inventoryModulePath) {
    . $inventoryModulePath
    Write-Host "✅ Inventory module loaded successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Inventory module not found at: $inventoryModulePath" -ForegroundColor Red
    exit 1
}

# Check prerequisites (PowerShell 7+ and required modules)
if (-not (Test-Prerequisites -UpdateModules:$UpdateModules)) {
    Write-Host "❌ Prerequisites check failed. Please resolve the issues above and try again." -ForegroundColor Red
    exit 1
}

# Check Azure connection
function Test-AzureConnection {
    try {
        $context = Get-AzContext -ErrorAction SilentlyContinue
        if ($null -eq $context) {
            Write-Host "    ℹ️  No Azure context found" -ForegroundColor Gray
            return $false
        }
        Write-Host "    ✅ Azure context found: $($context.Account.Id)" -ForegroundColor Gray
        return $true
    }
    catch {
        Write-Host "    ❌ Error checking Azure connection: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Global state
$script:IsAuthenticated = Test-AzureConnection
$script:InventoryData = @{}
$script:LastUpdate = $null
$script:WafConfig = $null

# Load WAF configuration
Write-Host "📋 Loading WAF configuration..." -ForegroundColor Cyan
$wafConfigPath = Join-Path $PSScriptRoot "waf-config.json"
if (Test-Path $wafConfigPath) {
    try {
        $script:WafConfig = Get-Content $wafConfigPath -Raw | ConvertFrom-Json
        Write-Host "✅ WAF configuration loaded successfully" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Warning: Failed to load WAF configuration: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   WAF assessment will not be available" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  Warning: WAF configuration file not found at: $wafConfigPath" -ForegroundColor Yellow
    Write-Host "   WAF assessment will not be available" -ForegroundColor Gray
}

# Verify inventory function is available
if (Get-Command Get-AVDInventoryData -ErrorAction SilentlyContinue) {
    Write-Host "✅ Get-AVDInventoryData function is available" -ForegroundColor Green
} else {
    Write-Host "❌ Get-AVDInventoryData function not found! Server cannot collect inventory." -ForegroundColor Red
    exit 1
}

Write-Host "🔐 Azure Authentication Status: $(if ($script:IsAuthenticated) { 'Connected ✓' } else { 'Not Connected ✗' })" -ForegroundColor $(if ($script:IsAuthenticated) { 'Green' } else { 'Yellow' })

# HTTP Listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "🌐 Server started at http://localhost:$Port" -ForegroundColor Green
Write-Host "📊 Access the AVD Inventory Dashboard in your browser" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.AbsolutePath
        $method = $request.HttpMethod
        
        Write-Host "$(Get-Date -Format 'HH:mm:ss') $method $path" -ForegroundColor Gray
        
        try {
            # Content type and response
            $content = ""
            $contentType = "text/html; charset=utf-8"
            
            # Route handling
            switch -Regex ($path) {
            '^/$' {
                # Serve main page
                $indexPath = Join-Path $PSScriptRoot "index.html"
                if (Test-Path $indexPath) {
                    $content = Get-Content $indexPath -Raw
                } else {
                    $content = "<html><body><h1>AVD Inventory Server</h1><p>index.html not found</p></body></html>"
                }
            }
            
            '^/test\.html$' {
                # Serve test page
                $testPath = Join-Path $PSScriptRoot "test.html"
                if (Test-Path $testPath) {
                    $content = Get-Content $testPath -Raw
                } else {
                    $content = "<html><body><h1>Test Page Not Found</h1></body></html>"
                }
            }
            
            '^/styles\.css$' {
                $cssPath = Join-Path $PSScriptRoot "styles.css"
                if (Test-Path $cssPath) {
                    $content = Get-Content $cssPath -Raw
                    $contentType = "text/css"
                }
            }
            
            '^/app\.js$' {
                $jsPath = Join-Path $PSScriptRoot "app.js"
                if (Test-Path $jsPath) {
                    $content = Get-Content $jsPath -Raw
                    $contentType = "application/javascript"
                }
            }
            
            '^/favicon\.ico$' {
                # Return empty response for favicon to prevent 404 errors
                $response.StatusCode = 204
                $content = ""
            }
            
            '^/api/auth/status$' {
                try {
                    $script:IsAuthenticated = Test-AzureConnection
                    $authStatus = @{
                        authenticated = $script:IsAuthenticated
                        context = if ($script:IsAuthenticated) {
                            $ctx = Get-AzContext
                            @{
                                account = $ctx.Account.Id
                                subscription = $ctx.Subscription.Name
                                tenant = $ctx.Tenant.Id
                            }
                        } else { $null }
                    }
                    $content = $authStatus | ConvertTo-Json
                    $contentType = "application/json"
                    Write-Host "  ✅ Auth status returned: authenticated=$($script:IsAuthenticated)" -ForegroundColor Green
                } catch {
                    Write-Host "  ❌ Error in auth/status: $($_.Exception.Message)" -ForegroundColor Red
                    $content = @{ authenticated = $false; error = $_.Exception.Message } | ConvertTo-Json
                    $contentType = "application/json"
                }
            }
            
            '^/api/auth/login$' {
                try {
                    Connect-AzAccount -UseDeviceAuthentication | Out-Null
                    $script:IsAuthenticated = $true
                    $content = @{ success = $true; message = "Authentication successful" } | ConvertTo-Json
                } catch {
                    $content = @{ success = $false; message = $_.Exception.Message } | ConvertTo-Json
                }
                $contentType = "application/json"
            }
            
            '^/api/waf/config$' {
                # Serve WAF configuration
                try {
                    if ($null -ne $script:WafConfig) {
                        Write-Host "  📋 Serving WAF configuration" -ForegroundColor Cyan
                        $content = $script:WafConfig | ConvertTo-Json -Depth 20 -Compress:$false
                        Write-Host "  ✅ WAF config sent ($(($content.Length / 1KB).ToString('N2')) KB)" -ForegroundColor Green
                    } else {
                        Write-Host "  ⚠️  WAF configuration not available" -ForegroundColor Yellow
                        $response.StatusCode = 503
                        $content = @{ error = "WAF configuration not loaded" } | ConvertTo-Json
                    }
                } catch {
                    Write-Host "  ❌ Error serving WAF config: $($_.Exception.Message)" -ForegroundColor Red
                    $response.StatusCode = 500
                    $content = @{ error = $_.Exception.Message } | ConvertTo-Json
                }
                $contentType = "application/json"
            }
            
            '^/api/inventory/data$' {
                Write-Host "  🔍 Inventory data endpoint hit. Auth status: $($script:IsAuthenticated)" -ForegroundColor Yellow
                if ($script:IsAuthenticated) {
                    try {
                        Write-Host "  📊 Collecting AVD inventory..." -ForegroundColor Cyan
                        Write-Host "  ⏱️  Start time: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
                        
                        # Verify function exists before calling
                        if (-not (Get-Command Get-AVDInventoryData -ErrorAction SilentlyContinue)) {
                            throw "Get-AVDInventoryData function not found. The inventory module may not have loaded correctly."
                        }
                        
                        $script:InventoryData = Get-AVDInventoryData
                        
                        Write-Host "  ✅ Inventory collection complete" -ForegroundColor Green
                        Write-Host "  ⏱️  End time: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
                        
                        $script:LastUpdate = Get-Date
                        
                        Write-Host "  📦 Converting to JSON..." -ForegroundColor Gray
                        $content = $script:InventoryData | ConvertTo-Json -Depth 20 -Compress:$false
                        Write-Host "  ✅ JSON conversion complete ($(($content.Length / 1KB).ToString('N2')) KB)" -ForegroundColor Green
                    } catch {
                        Write-Host "  ❌ Error collecting inventory: $($_.Exception.Message)" -ForegroundColor Red
                        Write-Host "  📍 Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Red
                        Write-Host "  📍 Error details: $($_ | Format-List * -Force | Out-String)" -ForegroundColor Red
                        $content = @{ error = $_.Exception.Message; details = $_.ScriptStackTrace } | ConvertTo-Json
                    }
                } else {
                    Write-Host "  ⚠️  Request rejected - not authenticated" -ForegroundColor Yellow
                    $response.StatusCode = 401
                    $content = @{ error = "Not authenticated" } | ConvertTo-Json
                }
                $contentType = "application/json"
            }
            
            '^/api/inventory/refresh$' {
                if ($script:IsAuthenticated) {
                    try {
                        Write-Host "  🔄 Refreshing AVD inventory..." -ForegroundColor Cyan
                        Write-Host "  ⏱️  Start time: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
                        
                        # Verify function exists before calling
                        if (-not (Get-Command Get-AVDInventoryData -ErrorAction SilentlyContinue)) {
                            throw "Get-AVDInventoryData function not found. The inventory module may not have loaded correctly."
                        }
                        
                        $script:InventoryData = Get-AVDInventoryData
                        
                        Write-Host "  ✅ Inventory refresh complete" -ForegroundColor Green
                        Write-Host "  ⏱️  End time: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
                        
                        $script:LastUpdate = Get-Date
                        $content = @{ success = $true; lastUpdate = $script:LastUpdate.ToString('o') } | ConvertTo-Json
                    } catch {
                        Write-Host "  ❌ Error refreshing inventory: $($_.Exception.Message)" -ForegroundColor Red
                        Write-Host "  📍 Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Red
                        Write-Host "  📍 Error details: $($_ | Format-List * -Force | Out-String)" -ForegroundColor Red
                        $content = @{ success = $false; error = $_.Exception.Message; details = $_.ScriptStackTrace } | ConvertTo-Json
                    }
                } else {
                    Write-Host "  ⚠️  Request rejected - not authenticated" -ForegroundColor Yellow
                    $response.StatusCode = 401
                    $content = @{ error = "Not authenticated" } | ConvertTo-Json
                }
                $contentType = "application/json"
            }
            
            '^/api/diagram/connections$' {
                if ($script:IsAuthenticated) {
                    try {
                        $diagramData = Get-AVDConnectionDiagram
                        $content = $diagramData | ConvertTo-Json -Depth 10
                    } catch {
                        $content = @{ error = $_.Exception.Message } | ConvertTo-Json
                    }
                } else {
                    $response.StatusCode = 401
                    $content = @{ error = "Not authenticated" } | ConvertTo-Json
                }
                $contentType = "application/json"
            }
            
            default {
                $response.StatusCode = 404
                $content = "<html><body><h1>404 Not Found</h1></body></html>"
            }
        }
        
        # Send response
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
        $response.ContentLength64 = $buffer.Length
        $response.ContentType = $contentType
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.OutputStream.Close()
        
        } catch {
            Write-Host "  ❌ Error handling request: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "  📍 Stack: $($_.ScriptStackTrace)" -ForegroundColor Red
            
            # Try to send error response
            try {
                $errorContent = @{ error = $_.Exception.Message } | ConvertTo-Json
                $errorBuffer = [System.Text.Encoding]::UTF8.GetBytes($errorContent)
                $response.StatusCode = 500
                $response.ContentType = "application/json"
                $response.ContentLength64 = $errorBuffer.Length
                $response.OutputStream.Write($errorBuffer, 0, $errorBuffer.Length)
                $response.OutputStream.Close()
            } catch {
                # If even error response fails, just close
                try { $response.OutputStream.Close() } catch {}
            }
        }
    }
}
finally {
    $listener.Stop()
    Write-Host "`n🛑 Server stopped" -ForegroundColor Yellow
}
