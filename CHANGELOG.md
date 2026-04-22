# Changelog

## 1.0.3 (May 28, 2025)

➕ Added Optional Products to ingestion process

🛠️ Fixed listPrice value

## 1.0.7 (July 24, 2025)

➕ Added support for exporting Variation Group products.
The system now indexes Variation Group products along with their associated variants, enabling more structured product grouping.

➕ Added configurable product image types.
Merchants can now define which image types (e.g., large, main, thumbnail) should be exported for each product.

🔧 Removed jQuery usage from the storefront.
Replaced jQuery-dependent scripts with native JavaScript to improve performance and compatibility.

⏱️ Extended job timeout limits.
Increased allowed execution time for product export jobs, enabling full catalog indexing for merchants with large product datasets.

🛠️ Miscellaneous minor fixes and enhancements

## 1.0.8 (April 22, 2026)

➕ Added Rezolve SNPD ingestion pipeline.
New product data ingestion flow that exports catalog data to Rezolve SNPD via a dedicated API, supporting both BASELINE (full catalog) and PARTIAL_CATALOG (incremental) upload modes.

➕ Added ingestion status polling job.
New `RezolveSnpd-CheckStatus` job polls the Rezolve API for the status of pending ingestion tasks and updates the corresponding custom objects.

➕ Added ingestion task tracking via custom objects.
Each ingestion run creates a `rezolveIngestionTask` custom object that tracks task ID, status, stage, metrics, and error details.

➕ Added incremental export with change detection.
PARTIAL_CATALOG mode exports only products modified since the last run, including price and inventory change detection.

➕ Added ingestion metrics tracking.
Captures and stores metrics (products sent, processing time, errors) for each ingestion run.

➕ Added new service `rezolvesnpd.http.ingest`.
Dedicated HTTP service for communicating with the Rezolve SNPD API, with file-based product data upload.

➕ Added new SNPD-specific site preferences and metadata.
New custom object types (`rzlvSnpdConfigs`, `rezolveIngestionTask`) and system object extensions for SNPD configuration and attribute mapping.
