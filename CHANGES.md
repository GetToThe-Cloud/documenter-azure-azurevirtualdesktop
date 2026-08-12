# Azure Virtual Desktop Inventory - Change Summary

## Latest Update: 2026-08-12 (v1.2.230)

### Consolidated Updates

- **Dynamic scaling values**: fixed nested create/delete schedule settings so VM limit `20` and host-pool minimum/maximum values such as `5` and `10` reach both the dashboard and PDF export.
- **Scaling compatibility**: when the installed Az model omits extended schedule fields, the collector falls back to the ARM scaling-plan resource and normalizes both REST and legacy schedule time formats.
- **Session-host configuration profiles**: added the complete profile inventory to the PDF, including deployment, image, disk, network, domain-join, security, diagnostics, custom-script, and URI-only Key Vault metadata.
- **Report styling**: added the GetToTheCloud wordmark, branded navy/azure/paper styling, branded cover, interior page headers, responsive page numbers, and improved table defaults.
- **Logo delivery**: the PowerShell HttpListener now serves the packaged WebP wordmark as binary data for reliable PDF branding.
- **XSS hardening**: added `escapeHtml`/`esc` helper; Azure-sourced values are HTML-escaped before insertion via `innerHTML`.
- **Removed `eval()`**: WAF conditions now use a strict numeric comparison parser.
- **Subresource Integrity**: CDN assets in `index.html` carry `integrity` and `crossorigin="anonymous"` attributes.
- **Subscription scope**: added subscription selection, scope validation, and visibility for subscriptions without readable resources.
- **Authentication and shutdown**: added interactive browser login, an async listener shutdown path for Ctrl+C, cleanup after failed listener startup, and direct foreground execution from `start.sh`.
- **Session-host configuration profiles**: added profile inventory with cmdlet detection and documented ARM REST fallback.
- **Profile details**: captures VM, image, disk, network, domain-join, security, boot diagnostics, custom-script, and provisioning metadata.
- **Key Vault safety**: records credential references as URI metadata only; secret values are never retrieved.
- **Dashboard**: added a dedicated Session Host Configurations view.
- **Dynamic scaling settings**: scaling-plan schedules now inventory and display scaling methods, VM limits, ramp-up/ramp-down minimum and maximum host-pool sizes, minimum-host percentages, and capacity thresholds in the dashboard and PDF export.
- **PDF layout**: increased spacing below report subsection dividers so rules no longer overlap headings, bullets, or WAF score text.
- **Module updates**: startup asks whether newer Az modules should be updated; `-UpdateModules` still updates them automatically without prompting.
- **Runtime clarification**: the standalone documenter uses PowerShell for its server; `app.js` runs in the browser and does not start Node.js.

---

## Previous: 2026-04-01 (v1.2.223)

### Module Version 1.2.223

- Version bump to 1.2.223 for PowerShell Gallery publish
- **PSGallery packaging**: `documenter-azure-azurevirtualdesktop.psd1` manifest and `.psm1` root module added
- **Edit-WAFConfig wizard**: new interactive console command to edit `waf-config.json` without touching JSON directly — supports pillar metadata, rule add/edit/delete, status mapping thresholds & colours
- **README**: updated with PSGallery install instructions and `Edit-WAFConfig` documentation

---

## Previous: 2026-03-06 (v1.2)

### Architecture Improvement: Server-Side Configuration Loading

The WAF configuration is now **loaded from the server on startup** instead of being embedded in the code. This provides the best of both worlds:

- **Separation of Concerns** - Configuration kept separate from application code
- **Instant availability** - Loaded from server on page initialization
- **No reload required** - Configuration available immediately when page loads
- **Easy updates** - Edit `waf-config.json` and restart server to update rules
- **Better maintainability** - Configuration changes don't require code modification

#### How It Works
```
1. PowerShell server starts → Loads waf-config.json into memory
2. Client page loads → Fetches config from /api/waf/config endpoint
3. Configuration available immediately → No user interaction needed
```

#### Server Changes
- New `/api/waf/config` endpoint serves WAF configuration
- Configuration loaded once on server startup for efficiency
- Server logs configuration load status

#### Client Changes
- Configuration fetched from server during page initialization
- `loadWAFConfiguration()` function added
- Integrated into `DOMContentLoaded` event
- Reload function updated to use server endpoint

---

## Update: 2026-03-06 (v1.1)

### Performance Improvement: Embedded WAF Configuration

The WAF configuration was **embedded directly in app.js** instead of being loaded via HTTP request. This eliminated the need for an external file fetch on page load.

*Note: This approach has been superseded by v1.2's server-side loading, which provides better separation while maintaining instant availability.*

---

## Initial Release: 2026-03-06 (v1.0)

## Overview
Refactored the WAF (Well-Architected Framework) assessment system to be configuration-driven and added JSON export functionality for inventory resources.

## Changes Made

### 1. New Files Created

#### `waf-config.json`
- Comprehensive configuration file for WAF assessment rules
- Contains all 5 pillars: Reliability, Security, Cost Optimization, Operational Excellence, Performance
- 40+ configurable assessment rules
- Threshold definitions and status mappings
- Easy to read and modify structure

#### `WAF-CONFIG-GUIDE.md`
- Complete documentation for the configuration system
- Examples of rule structures and customization
- Troubleshooting guide
- Best practices for configuration management

### 2. Modified Files

#### `app.js`
**Added:**
#### `app.js`
**Added:**
- `wafConfig` embedded configuration (700+ lines of WAF rules embedded directly)
- `exportToJSON()` - Exports complete inventory data to JSON file
- `evaluateCondition()` - Evaluates assessment rule conditions
- `evaluateOperator()` - Handles comparison operators
- `evaluateComplexCondition()` - Handles nested conditions
- `performWAFAssessmentWithConfig()` - New config-based assessment function
- `displayWAFConfig()` - Renders configuration in UI
- `downloadWAFConfig()` - Downloads current config as JSON
- `uploadWAFConfig()` - Uploads and validates custom config
- `reloadWAFConfig()` - Optionally reloads config from external file (with cache busting)

**Modified:**
- Removed `loadWAFConfiguration()` from startup - config is now embedded
- `performWAFAssessment()` - Now labeled as legacy, kept for backward compatibility
- `showSection()` - Added WAF config display trigger
- PDF export function - Uses new config-based assessment when available

#### `index.html`
**Added:**
- "Export JSON" button in header (exports inventory data)
- "WAF Config" button in header (quick access to config section)
- "WAF Configuration" navigation menu item
- New `wafconfig` section with:
  - Configuration viewer
  - Download/Upload/Reload buttons
  - Interactive rule display

### 3. Key Features

#### Configuration Management
- **View Configuration**: Browse all assessment rules, conditions, and scoring
- **Download Config**: Save configuration for backup or modification
- **Upload Config**: Load custom configurations
- **Reload Config**: Refresh from server file

#### JSON Export
- Export complete inventory data as JSON
- Includes all subscriptions, resources, and metadata
- Timestamped filename format: `AVD-Inventory-YYYY-MM-DD.json`
- Useful for integrations, backups, or external analysis

#### Transparent Scoring
- See exactly how WAF scores are calculated
- Understand point values for each rule
- View conditions that must be met
- Read recommendations for improvements

### 4. Benefits

#### For Users
1. **Instant Load**: Configuration available immediately, no HTTP request delay
2. **Transparency**: See exactly how assessments work
3. **Customization**: Adjust rules to match organizational standards
4. **Portability**: Export both data and configuration
5. **Documentation**: Built-in explanations for each rule
6. **Reliability**: No dependency on external file availability

#### For Administrators
1. **Easy Updates**: Modify rules without code changes
2. **Version Control**: Track configuration changes over time
3. **Flexibility**: Create multiple configuration profiles
4. **Compliance**: Align assessments with specific frameworks

#### For Development
1. **Maintainability**: Separate configuration from logic
2. **Testability**: Easy to test different rule sets
3. **Extensibility**: Add new rules without code refactoring
4. **Backward Compatibility**: Legacy assessment still available

### 5. Technical Details

#### Architecture
```
┌─────────────────┐
│   index.html    │
│  (UI Layer)     │
└────────┬────────┘
         │
         ├──> Export JSON ──────> Inventory Data File
         │
         ├──> WAF Config UI ──────> View/Edit Rules
         │
         v
┌─────────────────────────────────┐
│         app.js                  │
│      (Logic Layer)              │
│                                 │
│  ┌───────────────────────────┐ │
│  │ Embedded WAF Config       │ │
│  │ (Instantly Available)     │ │
│  └───────────────────────────┘ │
│                                 │
│  performWAFAssessmentWithConfig()│
│  (Config-based assessment)      │
│                                 │
│  performWAFAssessment()         │
│  (Legacy fallback)              │
└─────────────────────────────────┘
         │
         │ (Optional)
         v
┌─────────────────┐
│ waf-config.json │
│ (External File) │
│ - For overrides │
│ - Manual reload │
└─────────────────┘
```

#### Backward Compatibility
- Legacy `performWAFAssessment()` function preserved
- Automatic fallback if config fails to load
- Existing functionality remains unchanged

#### Error Handling
- Graceful degradation if config unavailable
- JSON validation for uploaded configs
- Console logging for debugging
- User-friendly error messages

### 6. Testing Recommendations

1. **Basic Functionality**
   - Verify config loads on page load
   - Test JSON export with sample data
   - Check WAF Config section displays properly

2. **Configuration Management**
   - Download config and verify content
   - Upload modified config and verify changes apply
   - Test reload functionality

3. **Assessment Accuracy**
   - Compare scores between config-based and legacy methods
   - Verify rules evaluate correctly
   - Test edge cases (empty data, missing fields)

4. **Browser Compatibility**
   - Test in Chrome, Firefox, Safari, Edge
   - Verify file download/upload works
   - Check responsive design

### 7. Migration Notes

#### No Breaking Changes
All existing functionality is preserved. The system automatically:
1. Loads the new configuration on startup
2. Uses config-based assessment if available
3. Falls back to legacy assessment if config fails

#### Users Don't Need To
- Update any existing workflows
- Change how they use the application
- Modify their data structures

#### Optional for Users
- Explore the WAF Config section
- Customize rules to their needs
- Export data for external use

### 8. Future Considerations

#### Potential Enhancements
- In-browser rule editor with forms
- Rule testing/preview before saving
- Multiple saved configuration profiles
- Config version comparison
- Assessment history with applied configs
- CAF (Cloud Adoption Framework) rules addition

#### Maintenance
- Regularly review and update rules
- Add new Azure AVD features as they release
- Gather user feedback on rule accuracy
- Update documentation with examples

## Files Modified Summary

| File | Lines Added | Lines Modified | Purpose |
|------|-------------|----------------|---------|
| waf-config.json | 700+ | New File | Configuration data |
| app.js | 300+ | 5 | Logic updates |
| index.html | 50+ | 10 | UI additions |
| WAF-CONFIG-GUIDE.md | 300+ | New File | Documentation |
| CHANGES.md | 200+ | New File | This file |

## Compatibility

- **Browser**: Modern browsers with ES6+ support
- **Dependencies**: No new dependencies added
- **Server**: Requires ability to serve JSON files
- **Data Format**: Fully compatible with existing inventory format

## Contact

Created by: Alex ter Neuzen  
Website: www.gettothe.cloud  
Date: March 6, 2026

---

For detailed usage instructions, see [WAF-CONFIG-GUIDE.md](./WAF-CONFIG-GUIDE.md)
