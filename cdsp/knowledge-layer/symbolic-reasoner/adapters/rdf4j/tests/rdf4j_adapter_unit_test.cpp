#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "mock_rdf4j_adapter.h"
#include "mock_request_builder.h"
#include "rdf4j_adapter.h"

class RDF4JAdapterTest : public ::testing::Test {
    // NOLINTBEGIN(cppcoreguidelines-non-private-member-variables-in-classes)
   protected:
    const std::string DATASTORE = "ds-test";
    const ReasonerServerData server_data_{"localhost", "8080", "auth", "", DATASTORE};

    std::shared_ptr<MockRDF4JAdapter> mock_rdf4j_adapter_;
    std::unique_ptr<MockRequestBuilder> mock_request_builder_;

    // NOLINTEND(cppcoreguidelines-non-private-member-variables-in-classes)
    void SetUp() override {
        mock_rdf4j_adapter_ = std::make_shared<MockRDF4JAdapter>(server_data_);
        mock_request_builder_ = std::make_unique<MockRequestBuilder>(
            server_data_.host, server_data_.port, server_data_.auth_base64);
    }
};

// Unit tests for RDF4JAdapter to verify success regular operations

/**
 * @brief Test fixture for RDF4JAdapter to check the existence of a datastore.
 */
TEST_F(RDF4JAdapterTest, CheckExistentDatastore) {
    const std::string target = "/datastores";
    const std::string expected_response = "ds-test";

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::get))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setAcceptType("text/plain"))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, testing::NotNull()))
        .WillOnce(
            testing::DoAll(testing::SetArgPointee<1>(expected_response), testing::Return(true)));

    EXPECT_TRUE(mock_rdf4j_adapter_->RDF4JAdapter::checkDataStore());
}

/**
 * @brief Unit test for RDF4JAdapter to verify the initialization process creates a datastore.
 */
TEST_F(RDF4JAdapterTest, InitializationCreatesDatastore) {
    const std::string target_create_data = "/datastores/" + DATASTORE;

    EXPECT_CALL(*mock_rdf4j_adapter_, checkDataStore()).WillOnce(testing::Return(false));

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target_create_data))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(true));

    EXPECT_NO_THROW(mock_rdf4j_adapter_->RDF4JAdapter::initialize());
}

/**
 * @brief Unit test for RDF4JAdapter to verify initialization skips creation when datastore exists.
 */
TEST_F(RDF4JAdapterTest, InitializationWithExistingDatastore) {
    EXPECT_CALL(*mock_rdf4j_adapter_, checkDataStore()).WillOnce(testing::Return(true));
    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder()).Times(0);

    EXPECT_NO_THROW(mock_rdf4j_adapter_->RDF4JAdapter::initialize());
}

/**
 * @brief Unit test for RDF4JAdapter to verify successful data loading.
 */
TEST_F(RDF4JAdapterTest, LoadDataSuccess) {
    const std::string target = "/datastores/" + DATASTORE + "/content";
    const std::string ttl_data = "@prefix : <http://example.org/> . :test a :Entity .";
    const ReasonerSyntaxType content_type = ReasonerSyntaxType::TURTLE;

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr,
                setContentType(reasonerSyntaxTypeToContentType(content_type)))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setBody(ttl_data))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(true));

    EXPECT_TRUE(mock_rdf4j_adapter_->RDF4JAdapter::loadData(
        ttl_data, reasonerSyntaxTypeToContentType(content_type)));
}

/**
 * @brief Unit test for RDF4JAdapter to verify that loadRules posts to the rules/add endpoint.
 */
TEST_F(RDF4JAdapterTest, LoadRulesSuccess) {
    const std::string target = "/datastores/" + DATASTORE + "/rules/add";
    const std::string shacl_rules =
        "@prefix sh: <http://www.w3.org/ns/shacl#> . :MyShape a sh:NodeShape .";
    const std::string content_type = "text/turtle";

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setContentType(content_type))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setBody(shacl_rules))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(true));

    EXPECT_TRUE(mock_rdf4j_adapter_->RDF4JAdapter::loadRules(shacl_rules, content_type));
}

/**
 * @brief Unit test for RDF4JAdapter to verify successful data querying.
 */
TEST_F(RDF4JAdapterTest, QueryDataSuccess) {
    const std::string target = "/datastores/" + DATASTORE + "/sparql";
    const std::string sparql_query = "SELECT ?s WHERE { ?s ?p ?o . }";
    const std::string mock_response = "<http://example.org/test>";

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setContentType("application/sparql-query"))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setBody(sparql_query))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr,
                setAcceptType(queryAcceptTypeToString(DataQueryAcceptType::TEXT_TSV)))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, testing::NotNull()))
        .WillOnce(testing::DoAll(testing::SetArgPointee<1>(mock_response), testing::Return(true)));

    EXPECT_EQ(mock_rdf4j_adapter_->RDF4JAdapter::queryData(sparql_query, QueryLanguageType::SPARQL,
                                                           DataQueryAcceptType::TEXT_TSV),
              mock_response);
}

/**
 * @brief Unit test for RDF4JAdapter to verify successful deletion of a datastore.
 */
TEST_F(RDF4JAdapterTest, DeleteDataStoreWhenExists) {
    const std::string target = "/datastores/" + DATASTORE;

    EXPECT_CALL(*mock_rdf4j_adapter_, checkDataStore()).WillOnce(testing::Return(true));

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::delete_))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(true));

    EXPECT_TRUE(mock_rdf4j_adapter_->RDF4JAdapter::deleteDataStore());
}

/**
 * @brief Unit test for RDF4JAdapter to verify that deleteDataStore returns true
 * when the datastore does not exist (nothing to delete).
 */
TEST_F(RDF4JAdapterTest, DeleteDataStoreWhenNotExists) {
    EXPECT_CALL(*mock_rdf4j_adapter_, checkDataStore()).WillOnce(testing::Return(false));
    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder()).Times(0);

    EXPECT_TRUE(mock_rdf4j_adapter_->RDF4JAdapter::deleteDataStore());
}

/**
 * @brief Unit test for RDF4JAdapter to verify that deleteDataStore returns false
 * when the DELETE request fails.
 */
TEST_F(RDF4JAdapterTest, DeleteDataStoreWhenExistsFails) {
    const std::string target = "/datastores/" + DATASTORE;

    EXPECT_CALL(*mock_rdf4j_adapter_, checkDataStore()).WillOnce(testing::Return(true));

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::delete_))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(false));

    EXPECT_FALSE(mock_rdf4j_adapter_->RDF4JAdapter::deleteDataStore());
}

// Unit tests for RDF4JAdapter to verify error handling

/**
 * @brief Unit test for RDF4JAdapter to verify behavior when datastore creation fails.
 */
TEST_F(RDF4JAdapterTest, FailedToCreateDataStore) {
    const std::string target_create_data = "/datastores/" + DATASTORE;

    EXPECT_CALL(*mock_rdf4j_adapter_, checkDataStore()).WillOnce(testing::Return(false));

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target_create_data))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(false));

    EXPECT_THROW(mock_rdf4j_adapter_->RDF4JAdapter::initialize(), std::runtime_error);
}

/**
 * @brief Unit test for RDF4JAdapter to verify behavior when loading data fails.
 */
TEST_F(RDF4JAdapterTest, LoadDataFailure) {
    const std::string target = "/datastores/" + DATASTORE + "/content";
    const std::string ttl_data = "@prefix : <http://example.org/> . :test a :Entity .";
    const ReasonerSyntaxType content_type = ReasonerSyntaxType::TURTLE;

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr,
                setContentType(reasonerSyntaxTypeToContentType(content_type)))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setBody(ttl_data))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(false));

    EXPECT_FALSE(mock_rdf4j_adapter_->RDF4JAdapter::loadData(
        ttl_data, reasonerSyntaxTypeToContentType(content_type)));
}

/**
 * @brief Unit test for RDF4JAdapter to verify that loadRules failure is propagated.
 */
TEST_F(RDF4JAdapterTest, LoadRulesFailure) {
    const std::string target = "/datastores/" + DATASTORE + "/rules/add";
    const std::string shacl_rules =
        "@prefix sh: <http://www.w3.org/ns/shacl#> . :MyShape a sh:NodeShape .";
    const std::string content_type = "text/turtle";

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setContentType(content_type))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setBody(shacl_rules))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, nullptr))
        .WillOnce(testing::Return(false));

    EXPECT_FALSE(mock_rdf4j_adapter_->RDF4JAdapter::loadRules(shacl_rules, content_type));
}

/**
 * @brief Unit test for RDF4JAdapter to verify behavior when a SPARQL query fails.
 */
TEST_F(RDF4JAdapterTest, QueryDataFailure) {
    const std::string target = "/datastores/" + DATASTORE + "/sparql";
    const std::string sparql_query = "SELECT ?s WHERE { ?s ?p ?o . }";
    const DataQueryAcceptType accept_type = DataQueryAcceptType::TEXT_TSV;

    MockRequestBuilder *mock_request_builder_ptr = mock_request_builder_.get();

    EXPECT_CALL(*mock_rdf4j_adapter_, createRequestBuilder())
        .WillOnce(testing::Return(::testing::ByMove(std::move(mock_request_builder_))));

    EXPECT_CALL(*mock_request_builder_ptr, setMethod(http::verb::post))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setTarget(target))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setContentType("application/sparql-query"))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setBody(sparql_query))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, setAcceptType(queryAcceptTypeToString(accept_type)))
        .WillOnce(testing::ReturnRef(*mock_request_builder_ptr));
    EXPECT_CALL(*mock_request_builder_ptr, sendRequest(nullptr, testing::NotNull()))
        .WillOnce(testing::Return(false));

    EXPECT_EQ(mock_rdf4j_adapter_->RDF4JAdapter::queryData(sparql_query, QueryLanguageType::SPARQL,
                                                           accept_type),
              "");
}
