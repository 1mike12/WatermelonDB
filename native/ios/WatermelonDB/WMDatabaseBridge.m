#import "WMDatabaseBridge.h"
#import "JSIInstaller.h"

@implementation WMDatabaseBridge

#pragma mark - RCTBridgeModule stuff

RCT_EXPORT_MODULE();

@synthesize bridge = _bridge;

- (dispatch_queue_t) methodQueue
{
    // TODO: userInteractive QOS seems wrong, but that's what the Swift implementation used so far
    dispatch_queue_attr_t attr = dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INTERACTIVE, 0);
    return dispatch_queue_create("com.nozbe.watermelondb.database", attr);
}

+ (BOOL) requiresMainQueueSetup
{
    return NO;
}

#define BRIDGE_METHOD(name, args) \
    RCT_EXPORT_METHOD(name:(nonnull NSNumber *)connectionTag \
        args \
        resolve:(RCTPromiseResolveBlock)resolve \
        reject:(RCTPromiseRejectBlock)reject \
    )

#pragma mark - Initialization & Setup

BRIDGE_METHOD(initialize,
    databaseName:(nonnull NSString *)name
    schemaVersion:(nonnull NSNumber *)version
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(setUpWithSchema,
    databaseName:(nonnull NSString *)name
    schema:(nonnull NSString *)schema
    schemaVersion:(nonnull NSNumber *)version
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(setUpWithMigrations,
    databaseName:(nonnull NSString *)name
    migrations:(nonnull NSString *)migrationSQL
    fromVersion:(nonnull NSNumber *)fromVersion
    toVersion:(nonnull NSNumber *)toVersion
)
{
    // TODO: Unimplemented
}

#pragma mark - Database functions

BRIDGE_METHOD(find,
    table:(nonnull NSString *)table
    id:(nonnull NSString *)id
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(query,
    table:(nonnull NSString *)table
    query:(nonnull NSString *)query
    args:(nonnull NSArray *)args
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(queryIds,
    query:(nonnull NSString *)query
    args:(nonnull NSArray *)args
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(unsafeQueryRaw,
    query:(nonnull NSString *)query
    args:(nonnull NSArray *)args
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(count,
    query:(nonnull NSString *)query
    args:(nonnull NSArray *)args
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(batchJSON,
    operations:(NSString *)serializedOperations
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(unsafeResetDatabase,
    schema:(nonnull NSString *)schema
    schemaVersion:(nonnull NSNumber *)version
)
{
    // TODO: Unimplemented
}

BRIDGE_METHOD(getLocal,
    key:(nonnull NSString *)key
)
{
    // TODO: Unimplemented
}

#pragma mark - JSI Support

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(initializeJSI)
{
    __block RCTCxxBridge *bridge = (RCTCxxBridge *) _bridge;
    dispatch_sync([self methodQueue], ^{
        installWatermelonJSI(bridge);
    });
    
    return @YES;
}


RCT_EXPORT_METHOD(provideSyncJson:(nonnull NSNumber *)id
    json:(nonnull NSString *)json
    resolve:(RCTPromiseResolveBlock)resolve
    reject:(RCTPromiseRejectBlock)reject)
{
    NSError *error;
    watermelondbProvideSyncJson(id.intValue, [json dataUsingEncoding:NSUTF8StringEncoding], &error);
    if (error) {
        // TODO: sendReject
        reject(@"db.provideSyncJson.error", error.localizedDescription, error);
    } else {
        resolve(@YES);
    }
}

#pragma mark - Helpers

@end
