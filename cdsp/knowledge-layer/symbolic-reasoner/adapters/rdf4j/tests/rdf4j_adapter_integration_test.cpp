#include <gtest/gtest.h>

#include <string>

#include "data_types.h"
#include "random_utils.h"
#include "rdf4j_adapter.h"
#include "server_data_fixture.h"

class RDF4JAdapterIntegrationTest : public ::testing::Test {
   protected:
    RDF4JAdapter* adapter_;

    const ReasonerServerData rdf4j_server_ = ServerDataFixture::getValidRDF4JServerData();
    const std::string triple_subject_ = RandomUtils::generateRandomString(8);
    const std::string triple_object_ = RandomUtils::generateRandomString(6);

    void SetUp() override {
        adapter_ = new RDF4JAdapter(rdf4j_server_);
        adapter_->initialize();

        if (!adapter_->checkDataStore()) {
            FAIL() << "Failed to ensure the data store is set up.";
        }
    }

    void TearDown() override {
        ASSERT_TRUE(adapter_->deleteDataStore()) << "Failed to clean up the test data store.";
        delete adapter_;
    }
};

/**
 * @brief Test to verify implicit initialization of the data store via SetUp.
 */
TEST_F(RDF4JAdapterIntegrationTest, DataStoreInitializationTest) { SUCCEED(); }

/**
 * @brief Test to verify loading RDF data and querying it back.
 */
TEST_F(RDF4JAdapterIntegrationTest, LoadAndQueryDataConsistency) {
    const std::string turtle_data = R"(
        @prefix car: <http://example.com/car#> .
        car:)" + triple_subject_ + R"( a car:)" + triple_object_ + R"( .
    )";

    ASSERT_TRUE(adapter_->loadData(turtle_data, reasonerSyntaxTypeToContentType(ReasonerSyntaxType::TURTLE)))
        << "Failed to load Turtle data.";

    const std::string sparql = "SELECT ?s ?p ?o WHERE { ?s ?p ?o }";
    const std::string result = adapter_->queryData(sparql);

    ASSERT_FALSE(result.empty()) << "SPARQL query returned no results.";
    EXPECT_TRUE(result.find("<http://example.com/car#" + triple_subject_ + ">") != std::string::npos)
        << "Result does not contain the expected subject.";
    EXPECT_TRUE(result.find("<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>") != std::string::npos)
        << "Result does not contain the expected predicate.";
    EXPECT_TRUE(result.find("<http://example.com/car#" + triple_object_ + ">") != std::string::npos)
        << "Result does not contain the expected object.";
}

/**
 * @brief Test to verify that SHACL rules are applied and inference results are queryable.
 *
 * Loads a SHACL rule that infers ex:InferredType for all ex:BaseType instances,
 * then loads a data triple and verifies the inferred triple appears in query results.
 */
TEST_F(RDF4JAdapterIntegrationTest, LoadRulesAndInfer) {
    const std::string base_type = "BaseType_" + triple_subject_;
    const std::string inferred_type = "InferredType_" + triple_subject_;
    const std::string instance = "instance_" + triple_subject_;

    const std::string shacl_rules = R"(
        @prefix sh:  <http://www.w3.org/ns/shacl#> .
        @prefix ex:  <http://example.com/> .

        ex:InferRule
            a sh:NodeShape ;
            sh:targetClass ex:)" + base_type + R"( ;
            sh:rule [
                a sh:SPARQLRule ;
                sh:construct """
                    PREFIX ex: <http://example.com/>
                    CONSTRUCT { ?this a ex:)" + inferred_type + R"( . }
                    WHERE { ?this a ex:)" + base_type + R"( . }
                """ ;
            ] .
    )";

    ASSERT_TRUE(adapter_->loadRules(shacl_rules, "text/turtle"))
        << "Failed to load SHACL rules.";

    const std::string turtle_data = R"(
        @prefix ex: <http://example.com/> .
        ex:)" + instance + R"( a ex:)" + base_type + R"( .
    )";

    ASSERT_TRUE(adapter_->loadData(turtle_data, reasonerSyntaxTypeToContentType(ReasonerSyntaxType::TURTLE)))
        << "Failed to load data.";

    const std::string sparql = "SELECT ?s ?o WHERE { ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?o }";
    const std::string result = adapter_->queryData(sparql);

    ASSERT_FALSE(result.empty()) << "SPARQL query returned no results.";
    EXPECT_TRUE(result.find("<http://example.com/" + inferred_type + ">") != std::string::npos)
        << "Inferred type not found — SHACL rule was not applied.";
}

/**
 * @brief Test to verify the deletion of the data store in RDF4JAdapter.
 *
 * Checks existence, deletes the datastore, and verifies it no longer exists.
 */
TEST_F(RDF4JAdapterIntegrationTest, DeleteDataStoreTest) {
    ASSERT_TRUE(adapter_->checkDataStore()) << "Any data store has been created.";
    ASSERT_TRUE(adapter_->deleteDataStore()) << "Failed to delete the data store.";
    ASSERT_FALSE(adapter_->checkDataStore()) << "The datastore might still exist or be recreated.";
}
