#include "DatabasePlatform.h"
#import <Foundation/Foundation.h>

namespace watermelondb {
namespace platform {

void consoleLog(std::string message) {
    NSLog(@"%s", message.c_str());
}

void consoleError(std::string message) {
    NSLog(@"Error: %s", message.c_str());
}

std::string resolveDatabasePath(std::string path) {
    return path; // TODO: Unimplemented
}

void onMemoryAlert(std::function<void(void)> callback) {
    // TODO: Unimplemented
}

} // namespace platform
} // namespace watermelondb
