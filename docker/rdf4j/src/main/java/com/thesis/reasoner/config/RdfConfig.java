package com.thesis.reasoner.config;

import org.eclipse.rdf4j.repository.Repository;
import org.eclipse.rdf4j.repository.sail.SailRepository;
import org.eclipse.rdf4j.sail.memory.MemoryStore;
import org.eclipse.rdf4j.sail.shacl.ShaclSail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RdfConfig {

    private static final Logger logger = LoggerFactory.getLogger(RdfConfig.class);

    // RDF4J main interface for interacting with a RDF store
    @Bean
    public Repository repository() {
        logger.info("Initializing RDF4J Reasoner with ShaclSail...");

        ShaclSail shaclSail = new ShaclSail(new MemoryStore());
        // Enable SHACL-AF features if needed in future
        shaclSail.setEclipseRdf4jShaclExtensions(true);
        shaclSail.setDashDataShapes(true);

        Repository repo = new SailRepository(shaclSail);
        repo.init();
        logger.info("RDF4J Reasoner initialized successfully.");

        return repo;
    }
}