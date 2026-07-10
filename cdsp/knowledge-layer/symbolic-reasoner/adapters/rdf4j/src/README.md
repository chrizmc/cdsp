# RDF4JAdapter

## Overview

`RDF4JAdapter` is responsible for communicating with the RDF4J reasoner service using RESTful APIs. This adapter allows users to perform various operations such as loading RDF data, loading SHACL rules, and querying data using [SPARQL](https://www.w3.org/TR/sparql11-query/).

> [!NOTE]
> When the `RDF4JAdapter` initializes, it creates a datastore in the RDF4J service if it does not exist.

> [!NOTE]
> Unlike RDFox, RDF4J does not perform incremental reasoning automatically. The Java service re-executes all SHACL rules after every `loadData()` call.

## Features

- **Data Store Management**:
  - Initialize and ensure the existence of the datastore.
  - Load RDF data in various formats (e.g., Turtle, N-Triples, N-Quads, TriG).

- **Rule Loading**:
  - Load SHACL rules (`sh:rule` / `sh:construct`) into the shape graph.
  - Rules are appended — loading multiple rule files does not overwrite previous ones.

- **Data Querying**:
  - Query data using SPARQL queries.
  - Support for multiple response content types such as `text/csv`, `application/sparql-results+json`, etc.

## Interface Mapping

| Method              | HTTP target       | Notes                                  |
| ------------------- | ----------------- | -------------------------------------- |
| `loadData()`        | POST `/content`   | Loads RDF data; rules re-execute after |
| `loadRules()`       | POST `/rules/add` | Appends to shape graph, does not reset |
| `queryData()`       | POST `/sparql`    |                                        |
| `deleteDataStore()` | DELETE `/`        | Deletes the datastore and clears data  |

## Example Usage

**Initializing the Adapter**

```cpp
#include "rdf4j_adapter.h"

int main() {
    ReasonerServerData server_data{"localhost", "12110", "<auth_base64>", "", "vehicle_ds"};
    RDF4JAdapter adapter(server_data);

    try {
        adapter.initialize();
        std::cout << "Datastore initialized successfully!" << std::endl;
    } catch (const std::runtime_error& e) {
        std::cerr << "Error initializing datastore: " << e.what() << std::endl;
    }

    return 0;
}
```

**Loading Data**

```cpp
std::string turtle_data = R"(
    @prefix ex: <http://example.com/> .
    ex:subject a ex:Object .
)";
adapter.loadData(turtle_data, reasonerSyntaxTypeToContentType(ReasonerSyntaxType::TURTLE));
```

**Loading SHACL Rules**

```cpp
std::string shacl_rules = R"(
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix ex: <http://example.com/> .

    ex:MyShape a sh:NodeShape ;
        sh:targetClass ex:Object ;
        sh:rule [
            a sh:TripleRule ;
            sh:subject sh:this ;
            sh:predicate ex:inferredProperty ;
            sh:object ex:inferredValue ;
        ] .
)";
adapter.loadRules(shacl_rules, "text/turtle");
```

**Querying Data**

```cpp
std::string sparql_query = "SELECT ?s ?p ?o WHERE { ?s ?p ?o }";
std::string result = adapter.queryData(sparql_query, QueryLanguageType::SPARQL,
                                       DataQueryAcceptType::TEXT_TSV);
std::cout << "Query Result: " << result << std::endl;
```

## Supported Data Formats

### For Loading Data

- `text/turtle`
- `application/trig`
- `application/n-triples`
- `application/n-quads`

### For Query Responses

- `text/tab-separated-values`
- `text/csv`
- `application/sparql-results+json`
- `application/sparql-results+xml`

# Testing

Unit and integration [tests](../tests/) are provided to ensure functionality. Tests cover the main components (`RDF4JAdapter`) to verify RDF data transfer, rule loading, and error handling.
