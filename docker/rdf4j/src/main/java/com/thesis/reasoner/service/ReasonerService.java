package com.thesis.reasoner.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.io.StringReader;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;
import org.eclipse.rdf4j.repository.Repository;
import org.eclipse.rdf4j.repository.RepositoryConnection;
import org.eclipse.rdf4j.query.resultio.sparqljson.SPARQLResultsJSONWriter;
import org.eclipse.rdf4j.query.resultio.text.tsv.SPARQLResultsTSVWriter;
import org.eclipse.rdf4j.query.TupleQuery;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.eclipse.rdf4j.model.IRI;
import org.eclipse.rdf4j.model.Statement;
import org.eclipse.rdf4j.model.Value;
import org.eclipse.rdf4j.model.Literal;
import org.eclipse.rdf4j.repository.RepositoryResult;
import org.eclipse.rdf4j.rio.helpers.StatementCollector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StopWatch;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

@Service
public class ReasonerService {

    private static final Logger logger = LoggerFactory.getLogger(ReasonerService.class);
    private final Repository repository;
    private static final String SHACL_SHAPE_GRAPH_URI = "http://rdf4j.org/schema/rdf4j#SHACLShapeGraph";
    private final List<String> cachedRules = new ArrayList<>();

    public ReasonerService(Repository repository, ResourceLoader resourceLoader) {
        this.repository = repository;
        loadShapes(resourceLoader);
    }

    // Helper to load rules from the shape graph into memory
    private void cacheRules(RepositoryConnection conn) {
        IRI shapeGraphIRI = conn.getValueFactory().createIRI(SHACL_SHAPE_GRAPH_URI);
        String SHACL_NS = "http://www.w3.org/ns/shacl#";
        IRI shRule = conn.getValueFactory().createIRI(SHACL_NS, "rule");
        IRI shConstruct = conn.getValueFactory().createIRI(SHACL_NS, "construct");
        IRI shOrder = conn.getValueFactory().createIRI(SHACL_NS, "order");

        class Rule implements Comparable<Rule> {
            String query;
            double order;
            Rule(String query, double order) {
                this.query = query;
                this.order = order;
            }
            @Override
            public int compareTo(Rule other) {
                return Double.compare(this.order, other.order);
            }
        }
        List<Rule> rules = new ArrayList<>();
        try (RepositoryResult<Statement> result = conn
                .getStatements(null, shRule, null, shapeGraphIRI)) {
            for (Statement st : result) {
                org.eclipse.rdf4j.model.Resource ruleNode = (org.eclipse.rdf4j.model.Resource) st.getObject();
                // Get Order
                double order = 0.0;
                try (RepositoryResult<Statement> orderSts = conn
                        .getStatements(ruleNode, shOrder, null, shapeGraphIRI)) {
                    if (orderSts.hasNext()) {
                        Value o = orderSts.next().getObject();
                        if (o instanceof Literal) {
                            order = ((Literal) o).doubleValue();
                        }
                    }
                }
                // Get Construct Query
                try (RepositoryResult<Statement> constructSts = conn
                        .getStatements(ruleNode, shConstruct, null, shapeGraphIRI)) {
                    for (Statement constructSt : constructSts) {
                        rules.add(new Rule(constructSt.getObject().stringValue(), order));
                    }
                }
            }
        }
        Collections.sort(rules);
        cachedRules.clear();
        for (Rule r : rules) {
            cachedRules.add(r.query);
        }
        logger.info("Cached {} SHACL rules (sorted by sh:order).", cachedRules.size());
    }

    private void loadShapes(ResourceLoader resourceLoader) {
        // CONFIG_PATH designates the external directory mapped via Docker where the
        // SHACL/DLOG rules and ontologies are stored
        String configPath = System.getenv("CONFIG_PATH");
        String prefix = (configPath != null && !configPath.isEmpty()) ? "file:" + configPath : "classpath:";

        try (RepositoryConnection conn = repository.getConnection()) {
            conn.begin();
            // Load Ontologies (sliding window config)
            String ontologyPath = prefix + (prefix.startsWith("file:") ? "/ontologies/sliding_window_config.ttl"
                    : "ontologies/sliding_window_config.ttl");
            logger.info("Loading Ontologies from: {}", ontologyPath);
            Resource ontologyResource = resourceLoader.getResource(ontologyPath);
            conn.add(ontologyResource.getInputStream(), "", RDFFormat.TURTLE);

            // Load SHACL Rules (driving_style_inference_rules_shacl.dlog)
            String rulePath = prefix + (prefix.startsWith("file:") ? "/rules/driving_style_inference_rules_shacl.dlog" : "rules/driving_style_inference_rules_shacl.dlog");

            // Load S1 Rule
            //String rulePath = prefix + (prefix.startsWith("file:") ? "/rules/s1_shacl.dlog" : "rules/s1_shacl.dlog");

            logger.info("Loading SHACL Rules from: {}", rulePath);
            Resource ruleResource = resourceLoader.getResource(rulePath);
            conn.add(ruleResource.getInputStream(), "", RDFFormat.TURTLE,
                    conn.getValueFactory().createIRI(SHACL_SHAPE_GRAPH_URI));

            // Extract and cache rules
            cacheRules(conn);
            conn.commit();
            logger.info("SHACL shapes and rules loaded successfully.");
        } catch (IOException e) {
            throw new RuntimeException("Failed to load SHACL shapes/rules", e);
        }
    }

    // Push data into the datastore
    public void addData(String rdfData) {
        try (RepositoryConnection conn = repository.getConnection()) {
            // micro measurements
            StopWatch watch = new StopWatch("addData Performance");

            watch.start("Begin");
            conn.begin();
            watch.stop();

            watch.start("AddTriples");
            conn.add(new StringReader(rdfData), "", RDFFormat.TURTLE);
            watch.stop();

            watch.start("ExecuteRules");
            executeShaclRules(conn);
            watch.stop();

            watch.start("Commit");
            conn.commit();
            watch.stop();

            // --- CSV LOG FOR PLOTTING ---
            StringBuilder csvLog = new StringBuilder("PERF_METRIC");
            csvLog.append(",").append(System.currentTimeMillis()); // Add a Unix timestamp for the X-axis

            // Get the times in milliseconds
            for (StopWatch.TaskInfo task : watch.getTaskInfo()) {
                csvLog.append(",").append(task.getTimeNanos() / 1_000_000.0);
            }
            logger.info(csvLog.toString());
            
            logger.debug("Data ingested and reasoning completed.");
        } catch (Exception e) {
            logger.error("Error during data ingestion/reasoning", e);
            throw new RuntimeException("Error during data ingestion", e);
        }
    }

    // verify
    private void executeShaclRules(RepositoryConnection conn) {
        IRI inferredContext = conn.getValueFactory().createIRI("http://example.org/inferred");
        conn.clear(inferredContext);
        long totalStatements = conn.size();
        long observations = 0;
        try (RepositoryResult<Statement> result = conn
                .getStatements(null,
                        conn.getValueFactory().createIRI("http://www.w3.org/ns/sosa/Observation"), null)) {
            while (result.hasNext()) {
                result.next();
                observations++;
            }
        }
        logger.info("Executing {} SHACL rules on repo with {} statements ({} sosa:Observation)...", cachedRules.size(),
                totalStatements, observations);
        int ruleIndex = 0;
        for (String rule : cachedRules) {
            ruleIndex++;
            try {
                // Execute the CONSTRUCT query and add results to the repository
                List<Statement> inferredStatements = new ArrayList<>();
                conn.prepareGraphQuery(rule).evaluate(new StatementCollector(inferredStatements));

                if (!inferredStatements.isEmpty()) {
                    conn.add(inferredStatements, inferredContext);
                    logger.info("Rule #{} inferred {} statements.", ruleIndex, inferredStatements.size());
                    // Optional: Log first inferred statement to see what's happening
                    if (logger.isDebugEnabled()) {
                        logger.debug("First inferred: {}", inferredStatements.get(0));
                    }
                } else {
                    logger.debug("Rule #{} inferred 0 statements.", ruleIndex);
                }
            } catch (Exception e) {
                logger.error("Failed to execute SHACL rule #" + ruleIndex, e);
            }
        }
        logger.info("Finished executing SHACL rules.");
    }

    // JSONWriter needs JSON
    public String inferJson(String sparqlQuery) {
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery query = conn.prepareTupleQuery(sparqlQuery);
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                SPARQLResultsJSONWriter writer = new SPARQLResultsJSONWriter(out);
                query.evaluate(writer);
                return out.toString(StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            logger.error("Error executing JSON inference", e);
            return "{\"head\":{\"vars\":[]},\"results\":{\"bindings\":[]}}";
        }
    }

    // TSV for TripleAssembler
    public String inferTsv(String sparqlQuery) {
        try (RepositoryConnection conn = repository.getConnection()) {
            TupleQuery query = conn.prepareTupleQuery(sparqlQuery);
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                SPARQLResultsTSVWriter writer = new SPARQLResultsTSVWriter(out);
                query.evaluate(writer);
                return out.toString(StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            logger.error("Error executing TSV inference", e);
            return "";
        }
    }
}