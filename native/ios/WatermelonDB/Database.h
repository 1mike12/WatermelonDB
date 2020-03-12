#pragma once

#import <jsi/jsi.h>
#import <sqlite3.h>
#import <map>
#import <set>

using namespace facebook;

namespace watermelondb
{

// Lightweight wrapper for handling sqlite3 lifetime
class SqliteDb
{
public:
    SqliteDb(std::string path);
    ~SqliteDb();

    sqlite3 *sqlite;

    SqliteDb &operator=(const SqliteDb &) = delete;
    SqliteDb(const SqliteDb &) = delete;
};

class Database : public jsi::HostObject
{
public:
    static void install(jsi::Runtime *runtime);
    Database(jsi::Runtime *runtime, std::string path);
    ~Database();

    jsi::Value find(jsi::Runtime &rt, jsi::String &tableName, jsi::String &id);
    jsi::Value query(jsi::Runtime &rt, jsi::String &tableName, jsi::String &sql, jsi::Array &arguments);
    jsi::Value count(jsi::Runtime &rt, jsi::String &sql, jsi::Array &arguments);
    void batch(jsi::Runtime &runtime, jsi::Array &operations);
    jsi::Array getDeletedRecords(jsi::Runtime &rt, jsi::String &tableName);
    void destroyDeletedRecords(jsi::Runtime &rt, jsi::String &tableName, jsi::Array &recordIds);
    void unsafeResetDatabase(jsi::Runtime &rt, jsi::String &schema, int schemaVersion);
    jsi::Value getLocal(jsi::Runtime &rt, jsi::String &key);
    void setLocal(jsi::Runtime &rt, jsi::String &key, jsi::String &value);
    void removeLocal(jsi::Runtime &rt, jsi::String &key);

private:
    jsi::Runtime *runtime_; // TODO: std::shared_ptr would be better, but I don't know how to make it from void* in RCTCxxBridge
    std::unique_ptr<SqliteDb> db_;
    std::map<std::string, sqlite3_stmt *> cachedStatements_;
    std::map<std::string, std::set<std::string> > cachedRecords_;

    void executeUpdate(jsi::Runtime &rt, std::string sql, jsi::Array &arguments);
    sqlite3_stmt* executeQuery(jsi::Runtime& rt, std::string sql, jsi::Array& arguments);
    jsi::Object resultDictionary(jsi::Runtime &rt, sqlite3_stmt *statement);
    int getUserVersion(jsi::Runtime &rt);
    void setUserVersion(jsi::Runtime &rt, int newVersion);
    void migrate(jsi::Runtime &rt, jsi::String &migrationSql, int fromVersion, int toVersion);
    bool isCached(std::string tableName, std::string recordId);
    void markAsCached(std::string tableName, std::string recordId);
    void removeFromCache(std::string tableName, std::string recordId);
};

} // namespace watermelondb
