# WAF Assessment Configuration Guide

## Overview

The WAF (Well-Architected Framework) assessment configuration is **loaded from the server on startup** for instant availability. The configuration is stored in `waf-config.json` and loaded by the PowerShell server when it starts. This approach keeps the configuration separate from the code while eliminating page reload delays.

## Architecture

```
Server Startup → Load waf-config.json → Store in memory
Client Load → Fetch from /api/waf/config → Available immediately
```

## What's New

### 1. **Server-Side Configuration Loading**
- Configuration file `waf-config.json` is loaded when the server starts
- Client fetches configuration from `/api/waf/config` endpoint during page initialization
- No embedded configuration - keeps code and config separate
- Easy to update: modify `waf-config.json` and restart server
- All assessment rules, scoring weights, and thresholds are available immediately
- Version-controlled configuration (current version: 1.0.0)

### 2. **JSON Export Functionality**
   - New "Export JSON" button in the header
   - Exports complete inventory data as JSON
   - File naming: `AVD-Inventory-YYYY-MM-DD.json`
   - Useful for backup, analysis, or integration with other tools

### 3. **WAF Configuration UI**
   - New "WAF Config" navigation menu item
   - Interactive configuration viewer showing:
     - All assessment pillars (Reliability, Security, Cost Optimization, Operational Excellence, Performance)
     - Individual rules with their scoring criteria
     - Conditions and calculations for each rule
     - Success/warning messages and recommendations
     - Status thresholds and color mapping

### 4. **Configuration Management**
   - **Download Config**: Save current configuration as JSON file
   - **Upload Config**: Load a custom configuration from your computer
   - **Reload Config**: Refresh configuration from server (reloads `waf-config.json`)

## Configuration File Structure

### Main Sections

```json
{
  "version": "1.0.0",
  "description": "Azure Virtual Desktop Well-Architected Framework Assessment Configuration",
  "pillars": {
    "reliability": { ... },
    "security": { ... },
    "costOptimization": { ... },
    "operationalExcellence": { ... },
    "performance": { ... }
  },
  "statusMapping": {
    "excellent": { "threshold": 80, "color": "#10B981" },
    "good": { "threshold": 60, "color": "#F59E0B" },
    "fair": { "threshold": 40, "color": "#FB923C" },
    "needsImprovement": { "threshold": 0, "color": "#EF4444" }
  }
}
```

### Pillar Structure

Each pillar contains:
- `name`: Display name
- `description`: Purpose of the pillar
- `maxChecks`: Maximum possible points
- `rules`: Array of assessment rules

### Rule Structure

Each rule can have:

#### Basic Properties
- `id`: Unique identifier (e.g., "rel-01")
- `name`: Rule name
- `description`: What the rule checks
- `points`: Maximum points awarded

#### Condition-Based Rules
```json
{
  "condition": {
    "field": "summary.totalHostPools",
    "operator": ">=",
    "value": 2
  },
  "successMessage": "✓ Message when condition is met",
  "warningMessage": "⚠ Message when partially met",
  "failureMessage": "✗ Message when condition fails",
  "recommendation": "Action to improve score"
}
```

#### Calculation-Based Rules
```json
{
  "calculation": "utilizationRate",
  "thresholds": [
    {
      "operator": "between",
      "minValue": 60,
      "maxValue": 80,
      "points": 2,
      "message": "✓ Good capacity utilization ({value}%)"
    }
  ]
}
```

## Supported Operators

### Comparison Operators
- `>=`, `>`, `<=`, `<`, `===`, `!==`
- `between`: Checks if value is between min and max

### Field Operators
- `count`: Counts matching items
- `contains`: Checks if array contains value
- `all`: All items must match
- `some`: At least one item matches
- `none`: No items match
- `pattern`: Regex pattern matching
- `uniqueCount`: Counts unique values

## Available Calculations

The following calculated metrics can be used:
- `availabilityRate`: Percentage of available session hosts
- `pooledRatio`: Ratio of pooled vs personal host pools
- `utilizationRate`: Capacity utilization percentage
- `avgHostsPerPool`: Average session hosts per pool
- `totalResources`: Total number of resources
- `avgAvailableHosts`: Average available hosts per pool
- `disconnectedRatio`: Ratio of disconnected sessions

## How to Customize

### Method 1: Edit File Directly
1. Open `waf-config.json` in a text editor
2. Modify rules, points, thresholds, or messages
3. Save the file
4. Reload the page or click "Reload Config"

### Method 2: Use the UI
1. Click "WAF Config" in the navigation menu
2. Click "Download Config" to save current configuration
3. Edit the downloaded JSON file
4. Click "Upload Config" to load your modified configuration
5. The new configuration will be used for assessments

## Examples

### Adding a New Rule

```json
{
  "id": "rel-10",
  "name": "Backup Configuration",
  "description": "Session hosts have backup configured",
  "points": 1,
  "condition": {
    "field": "sessionHosts",
    "operator": "some",
    "matchField": "backupEnabled",
    "matchValue": true
  },
  "successMessage": "✓ Backup is configured for session hosts",
  "warningMessage": "⚠ No backup configuration detected",
  "recommendation": "Enable Azure Backup for session host VMs"
}
```

### Modifying Point Values

To increase the importance of scaling plans:
```json
{
  "id": "cost-01",
  "name": "Scaling Plans",
  "points": 5,  // Changed from 3 to 5
  ...
}
```

Remember to adjust `maxChecks` in the pillar if you change total points!

### Changing Thresholds

To make the "good" rating require 70% instead of 60%:
```json
"statusMapping": {
  "excellent": { "threshold": 85 },
  "good": { "threshold": 70 },
  "fair": { "threshold": 50 },
  "needsImprovement": { "threshold": 0 }
}
```

## Tips

1. **Backup Before Editing**: Always download the current config before making changes
2. **Validate JSON**: Use a JSON validator to check syntax before uploading
3. **Test Incrementally**: Make small changes and test to see the impact
4. **Document Changes**: Keep notes on why you modified specific rules
5. **Version Control**: Update the version number when making significant changes

## Troubleshooting

### Configuration Not Loading
- Check browser console for errors
- Verify JSON syntax is valid
- Ensure the file is in the same directory as index.html

### Assessment Shows Wrong Scores
- Verify your condition operators are correct
- Check that field names match the data structure
- Test with the original config to compare

### Upload Fails
- Ensure the file is valid JSON
- Check that required fields (version, pillars) are present
- Verify threshold values are numeric

## Future Enhancements

Potential improvements for future versions:
- In-browser rule editor with form inputs
- Rule testing/preview functionality
- Multiple configuration profiles
- Export assessment results with applied config
- Historical comparison of scores with different configs

## Support

For questions or issues:
- Check the browser console for detailed error messages
- Compare your config with the original `waf-config.json`
- Ensure all required fields are present in your custom configuration

---

Created by Alex ter Neuzen | www.gettothe.cloud
