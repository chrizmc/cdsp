package com.thesis.reasoner.controller;

import com.thesis.reasoner.service.ReasonerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.HashSet;
import java.util.Set;

@RestController
public class ReasonerController {

    private static final Logger logger = LoggerFactory.getLogger(ReasonerController.class);
    private final ReasonerService reasonerService;
    private final Set<String> datastores = new HashSet<>();

    public ReasonerController(ReasonerService reasonerService) {
        this.reasonerService = reasonerService;
    }

    // RDFoxAdapter calls this endpoint to check if a datastore exists. Returns list of available datastores
    @GetMapping("/datastores")
    public ResponseEntity<String> listDatastores() {
        return ResponseEntity.ok(String.join(", ", datastores));
    }
    
    // Creates new datastore if needed
    @PostMapping("/datastores/{name}")
    public ResponseEntity<String> createDatastore(@PathVariable String name) {
        logger.info("Creating datastore: {}", name);
        datastores.add(name);
        return ResponseEntity.ok("Datastore " + name + " created.");
    }

    // Called by RDFoxAdapter to push incoming VSS data into the reasoner, allow multiple MIME types for robustness
    @PostMapping(value = "/datastores/{name}/content", consumes = { "text/turtle", "text/plain", "*/*" })
    public ResponseEntity<String> importContent(@PathVariable String name, @RequestBody String rdfData) {
        logger.debug("Received data chunk ({} chars) for datastore: {}", rdfData.length(), name);
        reasonerService.addData(rdfData);
        return ResponseEntity.ok("Content imported successfully.");
    }

    // SPARQL endpoint for KL
    @PostMapping(value = "/datastores/{name}/sparql", consumes = { "application/sparql-query",
            "application/sparql-update", "text/plain", "*/*" })
    public ResponseEntity<String> query(@PathVariable String name,
            @RequestBody String sparqlQuery, // Content of s1_output.rq
            @RequestHeader(value = "Accept", defaultValue = "*/*") String acceptHeader) {

        logger.debug("Executing SPARQL query on datastore: {} [Accept: {}]", name, acceptHeader);
        // TripleAssembler requests 'text/tab-separated-values' for internal logic.
        // JSONWriter requests 'application/sparql-results+json' for output.
        if (acceptHeader.contains("json")) {
            return ResponseEntity.ok()
                    .header("Content-Type", "application/sparql-results+json")
                    .body(reasonerService.inferJson(sparqlQuery));
        } else {
            return ResponseEntity.ok()
                    .header("Content-Type", "text/tab-separated-values")
                    .body(reasonerService.inferTsv(sparqlQuery));
        }
    }
}