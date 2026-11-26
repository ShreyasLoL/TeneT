cmake_minimum_required(VERSION 3.20)
project(tenet_bh_bake LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Threads REQUIRED)

add_executable(bh_bake bh_bake.cpp)
target_link_libraries(bh_bake PRIVATE Threads::Threads)
if(MSVC)
  target_compile_options(bh_bake PRIVATE /O2 /fp:precise)
else()
  target_compile_options(bh_bake PRIVATE -O3 -Wall -Wextra)
endif()

add_executable(bh_test bh_test.cpp)
target_link_libraries(bh_test PRIVATE Threads::Threads)
if(MSVC)
  target_compile_options(bh_test PRIVATE /O2 /fp:precise)
else()
  target_compile_options(bh_test PRIVATE -O3 -Wall -Wextra)
endif()
