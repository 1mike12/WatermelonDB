#include "Database.h"

namespace watermelondb {

Database::Database(jsi::Runtime *runtime) : runtime_(runtime) {
    jsi::Runtime& rt = *runtime;

    /* set up database */

    assert(sqlite3_threadsafe());

    int resultOpen = sqlite3_open("file:jsitests?mode=memory&cache=shared", &db_);

    if (resultOpen != SQLITE_OK) {
        std::abort(); // Unimplemented
    }

    /* set up jsi bindings */

    const char *name = "nativeWatermelonBatch";
    jsi::PropNameID propName = jsi::PropNameID::forAscii(rt, name);
    jsi::Function function = jsi::Function::createFromHostFunction(rt, propName, 1, [this](
        jsi::Runtime &runtime,
        const jsi::Value &,
        const jsi::Value *args,
        size_t count
    ) {
        if (count != 1) {
          throw std::invalid_argument("nativeWatermelonBatch takes 1 argument");
        }

        jsi::Runtime &rt = *runtime_;
        jsi::Array operations = args[0].asObject(rt).asArray(rt);
        batch(rt, operations);

        return jsi::Value::undefined();
    });
    rt.global().setProperty(rt, name, function);
}

void Database::install(jsi::Runtime *runtime) {
    jsi::Runtime& rt = *runtime;

    std::shared_ptr<Database> database = std::make_shared<Database>(runtime);
    rt.global().setProperty(*runtime, "nativeWatermelonDatabase", std::move(jsi::Object::createFromHostObject(rt, database)));
}

Database::~Database() {

}

void Database::executeUpdate(jsi::Runtime& rt, jsi::String&& sql, jsi::Array&& arguments) {
    sqlite3_stmt *statement = nullptr;
    int resultPrepare = sqlite3_prepare_v2(db_, sql.utf8(rt).c_str(), -1, &statement, nullptr);

    if (resultPrepare != SQLITE_OK) {
        std::abort(); // Unimplemented
    }

    int argsCount = sqlite3_bind_parameter_count(statement);

    if (argsCount != arguments.length(rt)) {
        std::abort(); // Unimplemented
    }

    for (int i = 0; i < argsCount; i++) {
        jsi::Value value = arguments.getValueAtIndex(rt, i);

        int bindResult;
        if (value.isNull()) {
            bindResult = sqlite3_bind_null(statement, i + 1);
        } else if (value.isString()) {
            // TODO: Check SQLITE_STATIC
            bindResult = sqlite3_bind_text(statement, i + 1, value.getString(rt).utf8(rt).c_str(), -1, SQLITE_TRANSIENT);
        } else if (value.isNumber()) {
            // TODO: Ints?
            bindResult = sqlite3_bind_double(statement, i + 1, value.getNumber());
        } else {
            std::abort(); // Unimplemented
        }

        if (bindResult != SQLITE_OK) {
            std::abort(); // Unimplemented
        }
    }

    int resultStep = sqlite3_step(statement);

    if (resultStep != SQLITE_DONE) {
        std::abort(); // Unimplemented
    }

    int resultFinalize = sqlite3_finalize(statement);

    if (resultFinalize != SQLITE_OK) {
        std::abort(); // Unimplemented
    }
}

void Database::batch(jsi::Runtime& rt, jsi::Array& operations) {
    size_t operationsCount = operations.length(rt);
    for (size_t i = 0; i < operationsCount; i++) {
        jsi::Array operation = operations.getValueAtIndex(rt, i).asObject(rt).asArray(rt);
        std::string type = operation.getValueAtIndex(rt, 0).asString(rt).utf8(rt);

        if (type == "create") {
            std::string table = operation.getValueAtIndex(rt, 1).asString(rt).utf8(rt);
            std::string id = operation.getValueAtIndex(rt, 2).asString(rt).utf8(rt);
            jsi::String sql = operation.getValueAtIndex(rt, 3).asString(rt);
            jsi::Array arguments = operation.getValueAtIndex(rt, 4).asObject(rt).asArray(rt);

            executeUpdate(rt, std::move(sql), std::move(arguments));
        } else if (type == "execute") {
            throw jsi::JSError(rt, "Unimplemented");
        } else if (type == "markAsDeleted") {
            throw jsi::JSError(rt, "Unimplemented");
        } else if (type == "destroyPermanently") {
            throw jsi::JSError(rt, "Unimplemented");
        } else {
            throw jsi::JSError(rt, "Invalid operation type");
        }
    }
}

} // namespace watermelondb
